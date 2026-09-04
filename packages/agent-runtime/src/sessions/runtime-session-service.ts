import { AgentRuntimeError } from '../contracts/errors.js'
import {
  AGENT_UI_PROTOCOL_VERSION,
  type AgentSessionSnapshot,
  type AgentSessionView,
  type AgentUiEvent,
} from '../contracts/ui.js'
import { redactString, redactValue, type RedactionOptions } from '../security/redaction.js'

import {
  KQ_CUSTOM_ENTRY,
  KQ_SESSION_SCHEMA_VERSION,
  type BeginRunInput,
  type KqRunStartedEntry,
  type KqRunTerminalEntry,
  type KqSessionMetadataEntry,
  type PersistEventInput,
  type RetryRunInput,
  type RunPersistenceContext,
} from './types.js'

import type {
  AgentMessage,
  CustomEntry,
  Entry,
  Session,
  SessionCreateOptions,
  SessionMetadata,
  SessionRepo,
  SessionTree,
} from '@earendil-works/pi-agent-core'

type AnySessionRepo = SessionRepo<SessionMetadata, SessionCreateOptions, never>

export interface RuntimeSessionServiceOptions {
  repository: AnySessionRepo
  createOptions?: (id: string) => SessionCreateOptions
  now?: () => number
  id?: () => string
  defaultTitle?: string
  redaction?: RedactionOptions
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireMetadata(value: unknown): KqSessionMetadataEntry {
  if (
    !isObject(value) ||
    typeof value.schemaVersion !== 'number' ||
    typeof value.updatedAt !== 'number'
  ) {
    throw new AgentRuntimeError('SESSION_CORRUPT', 'The Agent session metadata is invalid.')
  }
  if (value.schemaVersion > KQ_SESSION_SCHEMA_VERSION) {
    throw new AgentRuntimeError(
      'SESSION_SCHEMA_UNSUPPORTED',
      'This Agent session was created by a newer application version.',
    )
  }
  return { schemaVersion: value.schemaVersion, updatedAt: value.updatedAt }
}

function isCustom(entry: Entry, customType: string): entry is CustomEntry {
  return entry.type === 'custom' && entry.customType === customType
}

function requireRunStarted(value: unknown): KqRunStartedEntry {
  if (
    !isObject(value) ||
    value.schemaVersion !== KQ_SESSION_SCHEMA_VERSION ||
    typeof value.runId !== 'string' ||
    typeof value.turnId !== 'string' ||
    typeof value.lane !== 'string' ||
    typeof value.prompt !== 'string' ||
    typeof value.readOnly !== 'boolean' ||
    typeof value.userEntryId !== 'string' ||
    typeof value.startedAt !== 'number'
  ) {
    throw new AgentRuntimeError('SESSION_CORRUPT', 'The Agent run record is invalid.')
  }
  return value as unknown as KqRunStartedEntry
}

function requireRunTerminal(value: unknown): KqRunTerminalEntry {
  if (
    !isObject(value) ||
    value.schemaVersion !== KQ_SESSION_SCHEMA_VERSION ||
    typeof value.runId !== 'string' ||
    typeof value.status !== 'string' ||
    typeof value.endedAt !== 'number'
  ) {
    throw new AgentRuntimeError('SESSION_CORRUPT', 'The Agent terminal run record is invalid.')
  }
  return value as unknown as KqRunTerminalEntry
}

function replaySnapshot(session: AgentSessionView, events: AgentUiEvent[]): AgentSessionSnapshot {
  const messages = new Map<string, AgentSessionSnapshot['messages'][number]>()
  const tools = new Map<string, AgentSessionSnapshot['toolCalls'][number]>()
  const runs = new Map<string, AgentSessionSnapshot['runs'][number]>()
  let lastSequence = 0

  for (const event of events) {
    lastSequence = Math.max(lastSequence, event.sequence ?? 0)
    if ('runId' in event) {
      const previous = runs.get(event.runId) ?? {
        id: event.runId,
        sessionId: event.sessionId,
        status: 'idle' as const,
      }
      if (event.type === 'run.started')
        runs.set(event.runId, { ...previous, status: 'running', startedAt: event.startedAt })
      if (event.type === 'run.cancelling')
        runs.set(event.runId, { ...previous, status: 'cancelling' })
      if (event.type === 'run.completed')
        runs.set(event.runId, {
          ...previous,
          status: 'completed',
          endedAt: event.endedAt,
          usage: event.usage,
        })
      if (event.type === 'run.failed')
        runs.set(event.runId, {
          ...previous,
          status: 'failed',
          endedAt: event.endedAt,
          error: event.error,
        })
      if (event.type === 'run.interrupted')
        runs.set(event.runId, {
          ...previous,
          status: 'interrupted',
          endedAt: event.endedAt,
          error: event.error,
        })
      if (event.type === 'run.cancelled')
        runs.set(event.runId, {
          ...previous,
          status: event.partial ? 'partial' : 'cancelled',
          endedAt: event.endedAt,
        })
    }

    if (event.type === 'user.message.created' || event.type === 'action.summary')
      messages.set(event.message.id, event.message)
    if (event.type === 'assistant.message.started') {
      messages.set(event.messageId, {
        id: event.messageId,
        role: 'assistant',
        content: '',
        createdAt: event.createdAt,
        status: 'streaming',
      })
    }
    if (event.type === 'assistant.text.delta') {
      const message = messages.get(event.messageId)
      if (message)
        messages.set(event.messageId, { ...message, content: `${message.content}${event.delta}` })
    }
    if (event.type === 'assistant.message.completed' || event.type === 'assistant.message.failed') {
      const message = messages.get(event.messageId)
      if (message)
        messages.set(event.messageId, {
          ...message,
          status: event.type === 'assistant.message.completed' ? 'complete' : 'failed',
        })
    }
    if (event.type === 'tool.started') tools.set(event.call.id, event.call)
    if (event.type === 'tool.progress') {
      const tool = tools.get(event.toolCallId)
      if (tool) tools.set(event.toolCallId, { ...tool, progress: event.progress })
    }
    if (event.type === 'tool.finished') tools.set(event.result.id, event.result)
    if (event.type === 'tool.undone') {
      const tool = tools.get(event.toolCallId)
      if (tool) tools.set(event.toolCallId, { ...tool, status: 'undone' })
    }
  }

  return {
    session,
    messages: [...messages.values()],
    toolCalls: [...tools.values()],
    runs: [...runs.values()],
    lastSequence,
  }
}

export class RuntimeSessionService {
  private readonly repository: AnySessionRepo
  private readonly createOptions: (id: string) => SessionCreateOptions
  private readonly now: () => number
  private readonly id: () => string
  private readonly defaultTitle: string
  private readonly redaction: RedactionOptions
  private readonly opened = new Map<string, Session>()
  private readonly metadata = new Map<string, SessionMetadata>()

  constructor(options: RuntimeSessionServiceOptions) {
    this.repository = options.repository
    this.createOptions = options.createOptions ?? ((id) => ({ id }))
    this.now = options.now ?? Date.now
    this.id = options.id ?? (() => globalThis.crypto.randomUUID())
    this.defaultTitle = options.defaultTitle ?? 'New analysis'
    this.redaction = options.redaction ?? {}
  }

  async create(title = this.defaultTitle): Promise<AgentSessionView> {
    const id = this.id()
    const session = await this.repository.create(this.createOptions(id))
    this.opened.set(id, session)
    this.metadata.set(id, await session.getMetadata())
    await session.setName(title)
    const updatedAt = this.now()
    await session.appendCustomEntry(KQ_CUSTOM_ENTRY.sessionMetadata, {
      schemaVersion: KQ_SESSION_SCHEMA_VERSION,
      updatedAt,
    } satisfies KqSessionMetadataEntry)
    return { id, title, updatedAt }
  }

  async list(): Promise<AgentSessionView[]> {
    const metadata = await this.repository.list()
    const sessions = await Promise.all(metadata.map((entry) => this.catalogEntry(entry)))
    // The array is newly allocated above and has no external observers.
    // oxlint-disable-next-line unicorn/no-array-sort
    return sessions.sort((left, right) => right.updatedAt - left.updatedAt)
  }

  async open(sessionId: string): Promise<AgentSessionSnapshot> {
    const session = await this.requireSession(sessionId)
    await this.ensureSchema(session)
    const view = await this.catalogEntry(await session.getMetadata())
    const entries = await session.findEntries({
      customType: KQ_CUSTOM_ENTRY.event,
      order: 'oldestFirst',
    })
    const events = entries.map((entry) => {
      if (
        !isCustom(entry, KQ_CUSTOM_ENTRY.event) ||
        !isObject(entry.data) ||
        !isObject(entry.data.event)
      ) {
        throw new AgentRuntimeError('SESSION_CORRUPT', 'The Agent event checkpoint is invalid.')
      }
      return entry.data.event as unknown as AgentUiEvent
    })
    return replaySnapshot(view, events)
  }

  async rename(sessionId: string, title: string): Promise<void> {
    const session = await this.requireSession(sessionId)
    await session.setName(title.trim())
    await this.touch(session)
  }

  async delete(sessionId: string): Promise<void> {
    const metadata = await this.requireMetadata(sessionId)
    this.opened.delete(sessionId)
    this.metadata.delete(sessionId)
    await this.repository.delete(metadata)
  }

  async beginRun(input: BeginRunInput): Promise<RunPersistenceContext> {
    const session = await this.requireSession(input.sessionId)
    const lane = 'main'
    const prompt = redactString(input.prompt, this.redaction)
    const userEntryId = await session.view(lane).appendMessage({
      role: 'user',
      content: prompt,
      timestamp: input.startedAt,
    })
    const record: KqRunStartedEntry = {
      schemaVersion: KQ_SESSION_SCHEMA_VERSION,
      runId: input.runId,
      turnId: input.turnId,
      lane,
      prompt,
      readOnly: input.readOnly,
      ...(input.context ? { context: input.context } : {}),
      userEntryId,
      startedAt: input.startedAt,
    }
    await session.view(lane).appendCustomEntry(KQ_CUSTOM_ENTRY.runStarted, record)
    await this.touch(session)
    return { sessionId: input.sessionId, ...record }
  }

  async retryRun(input: RetryRunInput): Promise<RunPersistenceContext> {
    const session = await this.requireSession(input.sessionId)
    const original = await this.findRunStart(session, input.originalRunId)
    const userEntry = await session.getEntry(original.userEntryId)
    if (!userEntry)
      throw new AgentRuntimeError('SESSION_CORRUPT', 'The retry source message is missing.')
    const lane = `retry:${input.runId}`
    await session.createLane(lane, userEntry.parentId)
    const branch = session.view(lane)
    const userEntryId = await branch.appendMessage({
      role: 'user',
      content: original.prompt,
      timestamp: input.startedAt,
    })
    const record: KqRunStartedEntry = {
      schemaVersion: KQ_SESSION_SCHEMA_VERSION,
      runId: input.runId,
      turnId: input.turnId,
      lane,
      prompt: original.prompt,
      readOnly: original.readOnly,
      ...(original.context ? { context: original.context } : {}),
      userEntryId,
      startedAt: input.startedAt,
      retryOfRunId: input.originalRunId,
    }
    await branch.appendCustomEntry(KQ_CUSTOM_ENTRY.runStarted, record)
    await this.touch(session)
    return { sessionId: input.sessionId, ...record }
  }

  async persistEvent(input: PersistEventInput): Promise<AgentUiEvent> {
    const session = await this.requireSession(input.sessionId)
    const event = {
      ...input.event,
      protocolVersion: AGENT_UI_PROTOCOL_VERSION,
    } as AgentUiEvent
    const safe = redactValue(event, this.redaction) as AgentUiEvent
    await session.view(input.lane).appendCustomEntry(KQ_CUSTOM_ENTRY.event, {
      schemaVersion: KQ_SESSION_SCHEMA_VERSION,
      event: safe,
    })
    return safe
  }

  async appendAssistantMessage(
    context: RunPersistenceContext,
    content: string,
    timestamp: number,
  ): Promise<void> {
    await (await this.requireSession(context.sessionId)).view(context.lane).appendMessage({
      role: 'assistant',
      content: [{ type: 'text', text: redactString(content, this.redaction) }],
      api: 'openai-responses',
      provider: 'kq-runtime',
      model: 'redacted',
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'stop',
      timestamp,
    })
  }

  async finishRun(
    context: RunPersistenceContext,
    terminal: Omit<KqRunTerminalEntry, 'schemaVersion' | 'runId'>,
  ): Promise<void> {
    const session = await this.requireSession(context.sessionId)
    await session.view(context.lane).appendCustomEntry(KQ_CUSTOM_ENTRY.runTerminal, {
      schemaVersion: KQ_SESSION_SCHEMA_VERSION,
      runId: context.runId,
      ...terminal,
    } satisfies KqRunTerminalEntry)
    await this.touch(session)
  }

  async recoverInterrupted(): Promise<string[]> {
    const interrupted: string[] = []
    // Pi branch writes must remain ordered during recovery.
    // oxlint-disable eslint/no-await-in-loop
    for (const metadata of await this.repository.list()) {
      const session = await this.openMetadata(metadata)
      await this.ensureSchema(session)
      const starts = await session.findEntries({
        customType: KQ_CUSTOM_ENTRY.runStarted,
        order: 'oldestFirst',
      })
      const terminals = await session.findEntries({
        customType: KQ_CUSTOM_ENTRY.runTerminal,
        order: 'oldestFirst',
      })
      const terminalIds = new Set(
        terminals.map((entry) => requireRunTerminal((entry as CustomEntry).data).runId),
      )
      for (const entry of starts) {
        const started = requireRunStarted((entry as CustomEntry).data)
        if (terminalIds.has(started.runId)) continue
        const endedAt = this.now()
        const context: RunPersistenceContext = { sessionId: metadata.id, ...started }
        await this.finishRun(context, { status: 'interrupted', endedAt })
        await this.persistEvent({
          sessionId: metadata.id,
          lane: started.lane,
          event: {
            type: 'run.interrupted',
            runId: started.runId,
            sessionId: metadata.id,
            endedAt,
            error: {
              code: 'RUN_INTERRUPTED',
              message: 'The Agent run was interrupted when its host stopped.',
              retryable: true,
              recommendedAction: 'Retry this run.',
            },
          },
        })
        interrupted.push(started.runId)
      }
    }
    // oxlint-enable eslint/no-await-in-loop
    return interrupted
  }

  async findRun(runId: string): Promise<RunPersistenceContext> {
    // Stop on the first newest match without opening every session concurrently.
    // oxlint-disable eslint/no-await-in-loop
    for (const metadata of await this.repository.list()) {
      const session = await this.openMetadata(metadata)
      const entries = await session.findEntries({
        customType: KQ_CUSTOM_ENTRY.runStarted,
        order: 'newestFirst',
      })
      for (const entry of entries) {
        const started = requireRunStarted((entry as CustomEntry).data)
        if (started.runId === runId) return { sessionId: metadata.id, ...started }
      }
    }
    // oxlint-enable eslint/no-await-in-loop
    throw new AgentRuntimeError('RUN_NOT_ACTIVE', 'The requested Agent run does not exist.')
  }

  async getTranscript(context: RunPersistenceContext): Promise<AgentMessage[]> {
    const branch = (await this.requireSession(context.sessionId)).view(context.lane)
    const entries = await branch.findEntriesOnBranch({ type: 'message', order: 'oldestFirst' })
    return entries.flatMap((entry) =>
      entry.type === 'message' && entry.id !== context.userEntryId ? [entry.message] : [],
    )
  }

  private async findRunStart(session: Session, runId: string): Promise<KqRunStartedEntry> {
    const entries = await session.findEntries({
      customType: KQ_CUSTOM_ENTRY.runStarted,
      order: 'newestFirst',
    })
    for (const entry of entries) {
      const record = requireRunStarted((entry as CustomEntry).data)
      if (record.runId === runId) return record
    }
    throw new AgentRuntimeError('RUN_NOT_ACTIVE', 'The requested Agent run does not exist.')
  }

  private async catalogEntry(metadata: SessionMetadata): Promise<AgentSessionView> {
    const session = await this.openMetadata(metadata)
    const sessionMetadata = await this.ensureSchema(session)
    return {
      id: metadata.id,
      title: (await session.getName()) ?? this.defaultTitle,
      updatedAt: sessionMetadata.updatedAt,
    }
  }

  private async ensureSchema(session: Session): Promise<KqSessionMetadataEntry> {
    const entry = await session.findEntry({
      customType: KQ_CUSTOM_ENTRY.sessionMetadata,
      order: 'newestFirst',
    })
    if (!entry || !isCustom(entry, KQ_CUSTOM_ENTRY.sessionMetadata)) {
      throw new AgentRuntimeError('SESSION_CORRUPT', 'The Agent session metadata is missing.')
    }
    const metadata = requireMetadata(entry.data)
    if (metadata.schemaVersion < KQ_SESSION_SCHEMA_VERSION) {
      const migrated = { schemaVersion: KQ_SESSION_SCHEMA_VERSION, updatedAt: metadata.updatedAt }
      await session.appendCustomEntry(KQ_CUSTOM_ENTRY.sessionMetadata, migrated)
      return migrated
    }
    return metadata
  }

  private async touch(session: SessionTree): Promise<void> {
    await session.appendCustomEntry(KQ_CUSTOM_ENTRY.sessionMetadata, {
      schemaVersion: KQ_SESSION_SCHEMA_VERSION,
      updatedAt: this.now(),
    } satisfies KqSessionMetadataEntry)
  }

  private async requireSession(sessionId: string): Promise<Session> {
    const existing = this.opened.get(sessionId)
    if (existing) return existing
    return this.openMetadata(await this.requireMetadata(sessionId))
  }

  private async requireMetadata(sessionId: string): Promise<SessionMetadata> {
    const cached = this.metadata.get(sessionId)
    if (cached) return cached
    const metadata = (await this.repository.list()).find((entry) => entry.id === sessionId)
    if (!metadata)
      throw new AgentRuntimeError(
        'SESSION_NOT_FOUND',
        'The requested Agent session does not exist.',
      )
    this.metadata.set(sessionId, metadata)
    return metadata
  }

  private async openMetadata(metadata: SessionMetadata): Promise<Session> {
    const existing = this.opened.get(metadata.id)
    if (existing) return existing
    const session = await this.repository.open(metadata)
    this.opened.set(metadata.id, session)
    this.metadata.set(metadata.id, metadata)
    return session
  }
}
