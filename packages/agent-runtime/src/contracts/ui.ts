/** Stable Renderer contract. Pi, Provider, and host transport types stop here. */
export const AGENT_UI_PROTOCOL_VERSION = 4 as const

export type AgentRunStatus =
  | 'idle'
  | 'running'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'partial'
  | 'interrupted'

export type AgentMessageStatus = 'streaming' | 'complete' | 'cancelled' | 'failed'
export type ToolCallStatus =
  | 'queued'
  | 'running'
  | 'requires-confirmation'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'rejected'
  | 'undone'
export type ToolSafety = 'read-only' | 'reversible-write' | 'destructive'

export interface EvidenceView {
  symbol?: string
  period?: string
  source?: string
  timezone?: string
  range?: string
  returned?: number
}

export interface AgentMessageView {
  id: string
  role: 'user' | 'assistant' | 'action' | 'reasoning'
  content: string
  createdAt: number
  status?: AgentMessageStatus
  evidence?: EvidenceView
}

export interface ToolProgressView {
  label: string
  current?: number
  total?: number
}

export interface AgentErrorView {
  code: string
  message: string
  retryable: boolean
  recommendedAction?: string
}

export interface ToolCallView {
  id: string
  runId: string
  name: string
  label: string
  status: ToolCallStatus
  inputSummary: string
  resultSummary?: string
  /** 已脱敏的工具结果正文，供 UI 展示。 */
  resultContent?: string
  error?: AgentErrorView
  progress?: ToolProgressView
  safety: ToolSafety
  reversible: boolean
  canLocate?: boolean
  startedAt?: number
  finishedAt?: number
  durationMs?: number
  undoToken?: string
  evidence?: EvidenceView
}

/** 用户可管理的 Agent 工具设置项。 */
export interface AgentToolView {
  name: string
  label: string
  description: string
  enabled: boolean
}

/** 工具管理页手动执行一次工具后的可展示结果。 */
export interface AgentToolDebugResult {
  content: string
  summary: string
}

export type ConfirmationStatus = 'pending' | 'confirmed' | 'rejected' | 'expired'
export interface ConfirmationView {
  id: string
  toolCallId: string
  title: string
  description: string
  impact: string
  reversible: boolean
  expiresAt: number
  status: ConfirmationStatus
}

export interface AgentUsageView {
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  durationMs?: number
}

export interface ChartContextView {
  symbol: string | null
  period: string | null
  visibleRange?: string | null
  selectedBar?: string | null
}

/** Agent 单次运行的权限与可见图表范围。 */
export interface AgentRunScope extends ChartContextView {
  readOnly: boolean
}

export type ProviderConnectionState = 'not-configured' | 'testing' | 'connected' | 'error'
export type ProviderCompatibility = 'unknown' | 'testing' | 'incompatible' | 'compatible'
export const PROVIDER_API_PROTOCOLS = ['openai-responses', 'openai-completions'] as const
export type ProviderApiProtocol = (typeof PROVIDER_API_PROTOCOLS)[number]
export interface ProviderStatusView {
  state: ProviderConnectionState
  providerLabel: string
  configured?: boolean
  baseUrl?: string
  modelId?: string
  modelLabel?: string
  profileName?: string
  protocol?: ProviderApiProtocol
  fingerprint?: string
  compatibility?: ProviderCompatibility
  lastTestedAt?: number
  lastModelsRefreshAt?: number
  error?: AgentErrorView
}

export interface ProviderModelView {
  id: string
  name: string
  compatibility: Exclude<ProviderCompatibility, 'testing'>
  latencyMs?: number
  ttftMs?: number
}

export interface AgentSessionView {
  id: string
  title: string
  updatedAt: number
}

export interface AgentRunView {
  id: string | null
  sessionId: string | null
  status: AgentRunStatus
  startedAt?: number
  endedAt?: number
  usage?: AgentUsageView
  error?: AgentErrorView
}

interface EventEnvelope {
  protocolVersion: typeof AGENT_UI_PROTOCOL_VERSION
  /** Monotonic per-runtime cursor. Fake/browser bridges may omit it. */
  sequence?: number
}

interface RunEventEnvelope extends EventEnvelope {
  runId: string
  sessionId: string
}

export type AgentUiEvent =
  | (RunEventEnvelope & { type: 'run.started'; startedAt: number })
  | (RunEventEnvelope & { type: 'run.cancelling' })
  | (RunEventEnvelope & { type: 'run.cancelled'; partial: boolean; endedAt: number })
  | (RunEventEnvelope & { type: 'run.completed'; endedAt: number; usage?: AgentUsageView })
  | (RunEventEnvelope & { type: 'run.failed'; endedAt: number; error: AgentErrorView })
  | (RunEventEnvelope & { type: 'run.interrupted'; endedAt: number; error: AgentErrorView })
  | (RunEventEnvelope & { type: 'user.message.created'; message: AgentMessageView })
  | (RunEventEnvelope & {
      type: 'assistant.message.started'
      messageId: string
      createdAt: number
    })
  | (RunEventEnvelope & { type: 'assistant.text.delta'; messageId: string; delta: string })
  | (RunEventEnvelope & { type: 'assistant.message.completed'; messageId: string })
  | (RunEventEnvelope & { type: 'assistant.message.failed'; messageId: string })
  | (RunEventEnvelope & {
      type: 'assistant.thinking.started'
      messageId: string
      createdAt: number
    })
  | (RunEventEnvelope & { type: 'assistant.thinking.delta'; messageId: string; delta: string })
  | (RunEventEnvelope & { type: 'assistant.thinking.completed'; messageId: string })
  | (RunEventEnvelope & { type: 'action.summary'; message: AgentMessageView })
  | (RunEventEnvelope & { type: 'tool.started'; call: ToolCallView })
  | (RunEventEnvelope & {
      type: 'tool.progress'
      toolCallId: string
      progress: ToolProgressView
    })
  | (RunEventEnvelope & { type: 'tool.confirmation.required'; request: ConfirmationView })
  | (RunEventEnvelope & {
      type: 'tool.confirmation.resolved'
      confirmationId: string
      decision: 'confirmed' | 'rejected'
    })
  | (RunEventEnvelope & { type: 'tool.finished'; result: ToolCallView })
  | (RunEventEnvelope & { type: 'tool.undone'; toolCallId: string; undoneAt: number })
  | (EventEnvelope & { type: 'sessions.changed'; sessions: AgentSessionView[] })
  | (EventEnvelope & { type: 'provider.status.changed'; status: ProviderStatusView })

export type AgentUiEventInput = AgentUiEvent extends infer Event
  ? Event extends AgentUiEvent
    ? Omit<Event, 'protocolVersion' | 'sequence'>
    : never
  : never
type AgentRunUiEvent = Extract<AgentUiEvent, { runId: string }>
export type AgentRunUiEventInput = AgentRunUiEvent extends infer Event
  ? Event extends AgentRunUiEvent
    ? Omit<Event, 'protocolVersion' | 'sequence' | 'runId' | 'sessionId'>
    : never
  : never

export interface AgentSessionSnapshot {
  session: AgentSessionView
  messages: AgentMessageView[]
  toolCalls: ToolCallView[]
  runs: AgentRunView[]
  lastSequence: number
}

export interface StartRunInput {
  sessionId: string
  prompt: string
  readOnly: boolean
}
export interface ProviderTestInput {
  baseUrl: string
  apiKey?: string
  model: string
  protocol: ProviderApiProtocol
}
export interface ProviderSaveInput extends ProviderTestInput {
  modelName: string
  profileName: string
}
export interface ProviderProfileView {
  name: string
  baseUrl: string
  modelId: string
  modelName: string
  protocol: ProviderApiProtocol
}
export interface ProviderModelsInput {
  baseUrl: string
  apiKey?: string
  protocol: ProviderApiProtocol
}
export interface ProviderModelsResult {
  models: ProviderModelView[]
  refreshedAt: number
}
export interface ProviderProbeStageResult {
  stage: 'catalog' | 'text' | 'tool'
  ok: boolean
  latencyMs: number
  ttftMs?: number
}
export interface ProviderTestResult {
  compatible: boolean
  model: string
  latencyMs: number
  ttftMs?: number
  stages: ProviderProbeStageResult[]
}

export interface AgentBridgeClient {
  getChartContext(): ChartContextView | null
  subscribeChartContext(listener: (context: ChartContextView | null) => void): () => void
  listSessions(): Promise<AgentSessionView[]>
  openSession(sessionId: string): Promise<AgentSessionSnapshot>
  getProviderStatus(): Promise<ProviderStatusView>
  listTools(): Promise<AgentToolView[]>
  setToolEnabled(name: string, enabled: boolean): Promise<void>
  debugTool(name: string, input: unknown): Promise<AgentToolDebugResult>
  createSession(): Promise<AgentSessionView>
  renameSession(sessionId: string, title: string): Promise<void>
  deleteSession(sessionId: string): Promise<void>
  startRun(input: StartRunInput): Promise<{ runId: string }>
  cancelRun(runId: string): Promise<void>
  retryRun(runId: string): Promise<{ runId: string }>
  confirmTool(confirmationId: string, decision: 'confirmed' | 'rejected'): Promise<void>
  undoTurn(runId: string): Promise<void>
  listProviderModels(input: ProviderModelsInput): Promise<ProviderModelsResult>
  testProvider(input: ProviderTestInput): Promise<ProviderTestResult>
  listProviderProfiles(): Promise<ProviderProfileView[]>
  createProviderProfile(profileName: string): Promise<void>
  selectProviderProfile(profileName: string): Promise<void>
  saveProvider(input: ProviderSaveInput): Promise<void>
  deleteProviderCredential(): Promise<void>
  subscribe(listener: (event: AgentUiEvent) => void): () => void
}
