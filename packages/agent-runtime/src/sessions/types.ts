import type { AgentRunContext, AgentUiEvent, AgentUiEventInput } from '../contracts/ui.js'

export const KQ_SESSION_SCHEMA_VERSION = 1 as const
export const KQ_CUSTOM_ENTRY = {
  event: 'kq.ui.event',
  runStarted: 'kq.run.started',
  runTerminal: 'kq.run.terminal',
  sessionMetadata: 'kq.session.metadata',
  toolMapping: 'kq.tool.mapping',
  toolTrace: 'kq.tool.trace',
} as const

export interface KqSessionMetadataEntry {
  schemaVersion: number
  updatedAt: number
}

export interface KqRunStartedEntry {
  schemaVersion: typeof KQ_SESSION_SCHEMA_VERSION
  runId: string
  turnId: string
  lane: string
  prompt: string
  readOnly: boolean
  context?: AgentRunContext
  userEntryId: string
  startedAt: number
  retryOfRunId?: string
}

export interface KqRunTerminalEntry {
  schemaVersion: typeof KQ_SESSION_SCHEMA_VERSION
  runId: string
  status: 'completed' | 'failed' | 'cancelled' | 'partial' | 'interrupted'
  endedAt: number
}

export interface PersistedAgentEvent {
  schemaVersion: typeof KQ_SESSION_SCHEMA_VERSION
  event: AgentUiEvent
}

export interface BeginRunInput {
  sessionId: string
  runId: string
  turnId: string
  prompt: string
  readOnly: boolean
  context?: AgentRunContext
  startedAt: number
}

export interface RetryRunInput {
  sessionId: string
  originalRunId: string
  runId: string
  turnId: string
  startedAt: number
}

export interface RunPersistenceContext {
  sessionId: string
  runId: string
  turnId: string
  lane: string
  prompt: string
  readOnly: boolean
  context?: AgentRunContext
  userEntryId: string
  startedAt: number
  retryOfRunId?: string
}

export interface PersistEventInput {
  sessionId: string
  lane: string
  event: AgentUiEventInput | AgentUiEvent
}
