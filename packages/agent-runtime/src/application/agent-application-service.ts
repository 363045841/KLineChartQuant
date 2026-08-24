import { AgentRuntimeError, toAgentRuntimeError } from '../contracts/errors.js'
import {
  AGENT_UI_PROTOCOL_VERSION,
  type AgentRunUiEventInput,
  type AgentUiEvent,
  type ProviderStatusView,
  type ProviderModelsInput,
  type ProviderModelsResult,
  type ProviderTestInput,
  type ProviderTestResult,
  type StartRunInput,
} from '../contracts/ui.js'
import { PiRunDriver } from '../pi/pi-run-driver.js'

import type { AgentApplicationApi, AgentApplicationServiceOptions, RunDriver } from './types.js'
import type { RunPersistenceContext } from '../sessions/types.js'

interface ActiveRun {
  context: RunPersistenceContext
  driver: RunDriver
  status: 'running' | 'cancelling'
  completedReversibleTool: boolean
  promise: Promise<void>
}

type GlobalAgentUiEvent = Extract<
  AgentUiEvent,
  { type: 'sessions.changed' | 'provider.status.changed' | 'chart.context.changed' }
>
type GlobalAgentUiEventInput = GlobalAgentUiEvent extends infer Event
  ? Event extends GlobalAgentUiEvent
    ? Omit<Event, 'protocolVersion' | 'sequence'>
    : never
  : never

const DEFAULT_PROVIDER_STATUS: ProviderStatusView = {
  state: 'not-configured',
  providerLabel: '302.ai',
  configured: false,
  baseUrl: 'https://api.302.ai/v1',
  compatibility: 'unknown',
}

function isCancelling(active: ActiveRun): boolean {
  return active.status === 'cancelling'
}

export class AgentApplicationService implements AgentApplicationApi {
  private readonly sessions: AgentApplicationServiceOptions['sessions']
  private readonly createDriver: () => RunDriver
  private readonly createPlan: AgentApplicationServiceOptions['createPlan']
  private readonly provider: AgentApplicationServiceOptions['provider']
  private readonly now: () => number
  private readonly id: () => string
  private readonly logger: AgentApplicationServiceOptions['logger']
  private readonly listeners = new Set<(event: AgentUiEvent) => void>()
  private readonly activeByRun = new Map<string, ActiveRun>()
  private readonly activeBySession = new Map<string, string>()
  private sequence = 0

  constructor(options: AgentApplicationServiceOptions) {
    this.sessions = options.sessions
    this.createDriver = options.createDriver ?? (() => new PiRunDriver())
    this.createPlan = options.createPlan
    this.provider = options.provider
    this.now = options.now ?? Date.now
    this.id = options.id ?? (() => globalThis.crypto.randomUUID())
    this.logger = options.logger
  }

  async initialize(): Promise<string[]> {
    const interrupted = await this.sessions.recoverInterrupted()
    const snapshots = await Promise.all(
      (await this.sessions.list()).map((session) => this.sessions.open(session.id)),
    )
    for (const snapshot of snapshots) this.sequence = Math.max(this.sequence, snapshot.lastSequence)
    return interrupted
  }

  listSessions() {
    return this.sessions.list()
  }

  openSession(sessionId: string) {
    return this.sessions.open(sessionId)
  }

  async getProviderStatus(): Promise<ProviderStatusView> {
    return (await this.provider?.getStatus()) ?? DEFAULT_PROVIDER_STATUS
  }

  async createSession() {
    const session = await this.sessions.create()
    await this.emitGlobal({ type: 'sessions.changed', sessions: await this.sessions.list() })
    return session
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    await this.sessions.rename(sessionId, title)
    await this.emitGlobal({ type: 'sessions.changed', sessions: await this.sessions.list() })
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (this.activeBySession.has(sessionId)) {
      throw new AgentRuntimeError(
        'RUN_ACTIVE',
        'Stop the active Agent run before deleting its session.',
      )
    }
    await this.sessions.delete(sessionId)
    await this.emitGlobal({ type: 'sessions.changed', sessions: await this.sessions.list() })
  }

  async startRun(input: StartRunInput): Promise<{ runId: string }> {
    if (this.activeBySession.has(input.sessionId)) {
      throw new AgentRuntimeError('RUN_ACTIVE', 'Only one Agent run may be active in a session.')
    }
    const startedAt = this.now()
    const runId = this.id()
    const context = await this.sessions.beginRun({
      ...input,
      runId,
      turnId: this.id(),
      startedAt,
    })
    return this.launch(context)
  }

  async cancelRun(runId: string): Promise<void> {
    const active = this.activeByRun.get(runId)
    if (!active || active.status !== 'running') {
      throw new AgentRuntimeError('RUN_NOT_ACTIVE', 'The Agent run is not active.')
    }
    active.status = 'cancelling'
    await this.emitRun(active, { type: 'run.cancelling' })
    active.driver.abort()
    await active.promise
  }

  async retryRun(runId: string): Promise<{ runId: string }> {
    if (this.activeByRun.has(runId)) {
      throw new AgentRuntimeError('RUN_ACTIVE', 'Stop the active Agent run before retrying it.')
    }
    const original = await this.sessions.findRun(runId)
    if (this.activeBySession.has(original.sessionId)) {
      throw new AgentRuntimeError('RUN_ACTIVE', 'Only one Agent run may be active in a session.')
    }
    const context = await this.sessions.retryRun({
      sessionId: original.sessionId,
      originalRunId: runId,
      runId: this.id(),
      turnId: this.id(),
      startedAt: this.now(),
    })
    return this.launch(context)
  }

  async confirmTool(): Promise<void> {
    throw new AgentRuntimeError('RUN_NOT_ACTIVE', 'No tool confirmation is pending.')
  }

  async undoTurn(): Promise<void> {
    throw new AgentRuntimeError('RUN_NOT_ACTIVE', 'No reversible runtime tool result is available.')
  }

  async testProvider(input: ProviderTestInput): Promise<ProviderTestResult> {
    if (!this.provider)
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'No Agent Provider adapter is installed.',
      )
    await this.emitGlobal({
      type: 'provider.status.changed',
      status: {
        ...(await this.getProviderStatus()),
        state: 'testing',
        compatibility: 'testing',
        error: undefined,
      },
    })
    try {
      return await this.provider.test(input)
    } finally {
      await this.emitGlobal({
        type: 'provider.status.changed',
        status: await this.getProviderStatus(),
      })
    }
  }

  async listProviderModels(input: ProviderModelsInput): Promise<ProviderModelsResult> {
    if (!this.provider)
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'No Agent Provider adapter is installed.',
      )
    try {
      return await this.provider.listModels(input)
    } finally {
      await this.emitGlobal({
        type: 'provider.status.changed',
        status: await this.getProviderStatus(),
      })
    }
  }

  async deleteProviderCredential(): Promise<void> {
    await this.provider?.deleteCredential()
    await this.emitGlobal({
      type: 'provider.status.changed',
      status: await this.getProviderStatus(),
    })
  }

  subscribe(listener: (event: AgentUiEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async interruptOwnedRuns(): Promise<void> {
    const active = [...this.activeByRun.values()]
    for (const run of active) run.driver.abort()
    await Promise.allSettled(active.map((run) => run.promise))
  }

  private launch(context: RunPersistenceContext): { runId: string } {
    const driver = this.createDriver()
    const active: ActiveRun = {
      context,
      driver,
      status: 'running',
      completedReversibleTool: false,
      promise: Promise.resolve(),
    }
    this.activeByRun.set(context.runId, active)
    this.activeBySession.set(context.sessionId, context.runId)
    active.promise = this.execute(active)
    return { runId: context.runId }
  }

  private async execute(active: ActiveRun): Promise<void> {
    const { context } = active
    const startedAt = context.startedAt
    try {
      await this.emitRun(active, { type: 'run.started', startedAt })
      if (isCancelling(active)) {
        throw new AgentRuntimeError('ABORTED', 'The Agent run was cancelled.', { retryable: true })
      }
      await this.emitRun(active, {
        type: 'user.message.created',
        message: {
          id: context.userEntryId,
          role: 'user',
          content: context.prompt,
          createdAt: startedAt,
        },
      })
      if (isCancelling(active)) {
        throw new AgentRuntimeError('ABORTED', 'The Agent run was cancelled.', { retryable: true })
      }
      const configuredPlan = await this.createPlan(context)
      const plan = configuredPlan.transcript
        ? configuredPlan
        : { ...configuredPlan, transcript: await this.sessions.getTranscript(context) }
      const result = await active.driver.run(plan, async (event) => {
        if (
          event.type === 'tool.finished' &&
          event.result.status === 'succeeded' &&
          event.result.reversible
        ) {
          active.completedReversibleTool = true
        }
        await this.emitRun(active, event)
      })
      await this.sessions.appendAssistantMessage(context, result.text, this.now())
      const endedAt = this.now()
      await this.sessions.finishRun(context, { status: 'completed', endedAt })
      await this.emitRun(active, { type: 'run.completed', endedAt, usage: result.usage })
      this.log('info', 'agent.run.completed', active, { durationMs: endedAt - startedAt })
    } catch (thrown) {
      const error = toAgentRuntimeError(thrown)
      const endedAt = this.now()
      if (error.code === 'ABORTED') {
        const partial = active.completedReversibleTool
        await this.sessions.finishRun(context, {
          status: partial ? 'partial' : 'cancelled',
          endedAt,
        })
        await this.emitRun(active, { type: 'run.cancelled', partial, endedAt })
        this.log('info', 'agent.run.cancelled', active, {
          durationMs: endedAt - startedAt,
          partial,
        })
      } else {
        await this.sessions.finishRun(context, { status: 'failed', endedAt })
        await this.emitRun(active, { type: 'run.failed', endedAt, error: error.toView() })
        this.log('error', 'agent.run.failed', active, {
          durationMs: endedAt - startedAt,
          code: error.code,
        })
      }
    } finally {
      this.activeByRun.delete(context.runId)
      if (this.activeBySession.get(context.sessionId) === context.runId)
        this.activeBySession.delete(context.sessionId)
    }
  }

  private async emitRun(active: ActiveRun, event: AgentRunUiEventInput): Promise<void> {
    const projected = {
      ...event,
      protocolVersion: AGENT_UI_PROTOCOL_VERSION,
      sequence: ++this.sequence,
      runId: active.context.runId,
      sessionId: active.context.sessionId,
    } as AgentUiEvent
    const safe = await this.sessions.persistEvent({
      sessionId: active.context.sessionId,
      lane: active.context.lane,
      event: projected,
    })
    this.publish(safe)
  }

  private async emitGlobal(event: GlobalAgentUiEventInput): Promise<void> {
    this.publish({
      ...event,
      protocolVersion: AGENT_UI_PROTOCOL_VERSION,
      sequence: ++this.sequence,
    })
  }

  private publish(event: AgentUiEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  private log(
    level: 'info' | 'error',
    event: string,
    active: ActiveRun,
    fields: Record<string, unknown>,
  ): void {
    this.logger?.write({
      level,
      event,
      sessionId: active.context.sessionId,
      runId: active.context.runId,
      fields,
    })
  }
}
