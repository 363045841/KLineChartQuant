import { createHash } from 'node:crypto'

import {
  AgentRuntimeError,
  parseAgentIpcRequest,
  redactString,
  toAgentRuntimeError,
  type AgentApplicationApi,
  type AgentIpcRequest,
  type AgentRuntimeErrorCode,
} from '@363045841yyt/klinechart-agent-runtime'

export interface AgentIpcSenderContext {
  senderId: string
  windowId: string
  chartId: string
  isMainFrame: boolean
}

export type AgentIpcResponse =
  | { ok: true; value: unknown }
  | {
      ok: false
      error: {
        code: AgentRuntimeErrorCode
        message: string
        retryable: boolean
        recommendedAction?: string
      }
    }

interface CachedRequest {
  hash: string
  expiresAt: number
  response: AgentIpcResponse
}

export interface AgentIpcRouterOptions {
  application: AgentApplicationApi
  now?: () => number
  dedupeTtlMs?: number
  maxDedupeEntries?: number
}

function requestHash(request: AgentIpcRequest): string {
  return createHash('sha256').update(JSON.stringify(request)).digest('hex')
}

export class AgentIpcRouter {
  private readonly application: AgentApplicationApi
  private readonly now: () => number
  private readonly dedupeTtlMs: number
  private readonly maxDedupeEntries: number
  private readonly requests = new Map<string, CachedRequest>()
  private readonly sessionOwners = new Map<string, string>()
  private readonly runOwners = new Map<string, string>()

  constructor(options: AgentIpcRouterOptions) {
    this.application = options.application
    this.now = options.now ?? Date.now
    this.dedupeTtlMs = options.dedupeTtlMs ?? 60_000
    this.maxDedupeEntries = options.maxDedupeEntries ?? 1_024
  }

  async route(value: unknown, sender: AgentIpcSenderContext): Promise<AgentIpcResponse> {
    try {
      if (!sender.isMainFrame) {
        throw new AgentRuntimeError(
          'TARGET_MISMATCH',
          'Agent commands are accepted only from the registered main frame.',
        )
      }
      const request = parseAgentIpcRequest(value, this.now())
      if (request.windowId !== sender.windowId || request.chartId !== sender.chartId) {
        throw new AgentRuntimeError(
          'TARGET_MISMATCH',
          'The Agent command target does not belong to this Renderer.',
        )
      }
      this.pruneRequests()
      const hash = requestHash(request)
      const cached = this.requests.get(request.requestId)
      if (cached) {
        if (cached.hash !== hash) {
          throw new AgentRuntimeError(
            'DUPLICATE_REQUEST',
            'The Agent request ID was reused with different input.',
          )
        }
        return cached.response
      }

      this.assertOwnership(request, sender.senderId)
      const result = await this.dispatch(request)
      this.recordOwnership(request, result, sender.senderId)
      const response: AgentIpcResponse = { ok: true, value: result }
      this.cache(request.requestId, hash, response)
      return response
    } catch (thrown) {
      const error = toAgentRuntimeError(thrown)
      return {
        ok: false,
        error: {
          code: error.code,
          message: redactString(error.message),
          retryable: error.retryable,
          recommendedAction: error.recommendedAction,
        },
      }
    }
  }

  release(senderId: string): void {
    for (const [sessionId, owner] of this.sessionOwners)
      if (owner === senderId) this.sessionOwners.delete(sessionId)
    for (const [runId, owner] of this.runOwners)
      if (owner === senderId) this.runOwners.delete(runId)
  }

  private async dispatch(request: AgentIpcRequest): Promise<unknown> {
    switch (request.command) {
      case 'session.list':
        return this.application.listSessions()
      case 'session.create':
        return this.application.createSession()
      case 'session.open':
        return this.application.openSession(request.payload.sessionId)
      case 'session.rename':
        return this.application.renameSession(request.payload.sessionId, request.payload.title)
      case 'session.delete':
        return this.application.deleteSession(request.payload.sessionId)
      case 'run.start':
        return this.application.startRun(request.payload)
      case 'run.cancel':
        return this.application.cancelRun(request.payload.runId)
      case 'run.retry':
        return this.application.retryRun(request.payload.runId)
      case 'tool.confirm':
        return this.application.confirmTool(
          request.payload.confirmationId,
          request.payload.decision,
        )
      case 'turn.undo':
        return this.application.undoTurn(request.payload.runId)
      case 'provider.status':
        return this.application.getProviderStatus()
      case 'provider.models':
        return this.application.listProviderModels(request.payload)
      case 'provider.test':
        return this.application.testProvider(request.payload)
      case 'provider.delete':
        return this.application.deleteProviderCredential()
    }
  }

  private assertOwnership(request: AgentIpcRequest, senderId: string): void {
    if ('sessionId' in request.payload) {
      const owner = this.sessionOwners.get(request.payload.sessionId)
      if (owner && owner !== senderId)
        throw new AgentRuntimeError(
          'TARGET_MISMATCH',
          'The Agent session belongs to another target.',
        )
      if (!owner && request.command !== 'session.open') {
        throw new AgentRuntimeError(
          'TARGET_MISMATCH',
          'Open the Agent session before sending commands to it.',
        )
      }
    }
    if ('runId' in request.payload) {
      const owner = this.runOwners.get(request.payload.runId)
      if (owner !== senderId)
        throw new AgentRuntimeError('TARGET_MISMATCH', 'The Agent run belongs to another target.')
    }
  }

  private recordOwnership(request: AgentIpcRequest, value: unknown, senderId: string): void {
    if (request.command === 'session.list' && Array.isArray(value)) {
      for (const session of value) {
        if (
          typeof session === 'object' &&
          session !== null &&
          'id' in session &&
          typeof session.id === 'string'
        ) {
          if (!this.sessionOwners.has(session.id)) this.sessionOwners.set(session.id, senderId)
        }
      }
    }
    if (
      request.command === 'session.create' &&
      typeof value === 'object' &&
      value !== null &&
      'id' in value &&
      typeof value.id === 'string'
    ) {
      this.sessionOwners.set(value.id, senderId)
    }
    if (request.command === 'session.open')
      this.sessionOwners.set(request.payload.sessionId, senderId)
    if (
      (request.command === 'run.start' || request.command === 'run.retry') &&
      typeof value === 'object' &&
      value !== null &&
      'runId' in value &&
      typeof value.runId === 'string'
    ) {
      this.runOwners.set(value.runId, senderId)
    }
    if (request.command === 'session.delete') this.sessionOwners.delete(request.payload.sessionId)
  }

  private cache(requestId: string, hash: string, response: AgentIpcResponse): void {
    while (this.requests.size >= this.maxDedupeEntries) {
      const oldest = this.requests.keys().next().value
      if (typeof oldest !== 'string') break
      this.requests.delete(oldest)
    }
    this.requests.set(requestId, { hash, response, expiresAt: this.now() + this.dedupeTtlMs })
  }

  private pruneRequests(): void {
    const now = this.now()
    for (const [requestId, request] of this.requests)
      if (request.expiresAt <= now) this.requests.delete(requestId)
  }
}
