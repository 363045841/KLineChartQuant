// 宿主与 UI 的稳定契约：会话视图直接复用官方条目记录，不再维护第二套消息模型。
import type {
  ConversationRecord,
  EntryId,
  JsonObject,
  TranscriptItem,
} from '@earendil-works/pi-durable'

export const AGENT_UI_PROTOCOL_VERSION = 7 as const

/** Agent 正文中引用来源的稳定标记边界。 */
export const AGENT_CITATION_MARKER_PREFIX = '[[cite:'
export const AGENT_CITATION_MARKER_SUFFIX = ']]'

/** 将来源 ID 编码为 Agent 正文可识别的引用标记。 */
export function formatAgentCitation(id: string): string {
  return `${AGENT_CITATION_MARKER_PREFIX}${id}${AGENT_CITATION_MARKER_SUFFIX}`
}

/** 可由 Agent 正文引用的外部来源。 */
export type SourceCitation = {
  readonly id: string
  readonly title: string
  readonly url: string
  readonly snippet: string
  readonly publishedAt?: string
}

/** 工具结果携带的图表证据。 */
export type EvidenceView = {
  symbol?: string
  period?: string
  source?: string
  timezone?: string
  range?: string
  returned?: number
}

/** 工具执行进度。 */
export type ToolProgressView = {
  label: string
  current?: number
  total?: number
}

/** 一次运行的用量摘要，展示在输入区。 */
export type AgentUsageView = {
  inputTokens?: number
  outputTokens?: number
  /** 最后一次模型请求实际占用的输入上下文 token。 */
  contextTokens?: number
  /** 当前模型可用的上下文窗口。 */
  contextWindow?: number
  costUsd?: number
  durationMs?: number
}

/** 可展示的运行时错误。 */
export type AgentErrorView = {
  code: string
  message: string
  providerCode?: string
  raw?: string
  retryable: boolean
  recommendedAction?: string
}

/** 用户可管理的 Agent 工具设置项。 */
export interface AgentToolView {
  name: string
  label: string
  description: string
  enabled: boolean
  /** 工具的当前配置是否允许启用。 */
  available?: boolean
  /** 工具不可启用时向用户展示的原因。 */
  unavailableReason?: string
}

/** 工具管理页手动执行一次工具后的可展示结果。 */
export interface AgentToolDebugResult {
  content: string
  summary: string
}

/** Ask Question 卡片的一个可选项。 */
export interface QuestionOptionView {
  /** 机器可读的唯一值；作为答复回传给模型，必须在同一提问内唯一。 */
  readonly value: string
  /** 展示文本；允许与其他选项重复。 */
  readonly label: string
  readonly description?: string
}

/** 用户对一次提问的答复：选中的 option value 集合与可选的自由文本。 */
export interface QuestionAnswerView {
  readonly selectedValues: readonly string[]
  readonly note?: string
}

export type QuestionStatus = 'pending' | 'answered' | 'cancelled'
export interface QuestionView {
  id: string
  toolCallId: string
  prompt: string
  options: readonly QuestionOptionView[]
  multiSelect: boolean
  status: QuestionStatus
  answer?: QuestionAnswerView
}

/** 可安全跨 UI、Bridge 与 Provider 传递的上下文对象。 */
export interface AgentContextObject {
  readonly [key: string]: AgentContextValue
}

/** 可安全跨 UI、Bridge 与 Provider 传递的上下文值。 */
export type AgentContextValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<AgentContextValue>
  | AgentContextObject

/** 单个运行上下文；kind 用于让模型和运行时识别上下文语义。 */
export interface AgentContextItem<
  TKind extends string = string,
  TValue extends AgentContextValue = AgentContextValue,
> {
  readonly kind: TKind
  readonly value: TValue
}

/** 当前图表品种的最小身份上下文。 */
export interface AgentChartSymbolContextValue extends AgentContextObject {
  readonly symbol: string
  readonly name: string | null
}

/** 当前图表品种的上下文项。 */
export type AgentChartSymbolContextItem = AgentContextItem<
  'chart-symbol',
  AgentChartSymbolContextValue
>

/** 用户已确认的图表区间选择。 */
export interface AgentSelectedTimeRangeContextValue extends AgentContextObject {
  /** 按品种时区格式化的起始日期时间。 */
  readonly from: string
  /** 按品种时区格式化的结束日期时间。 */
  readonly to: string
}

/** 用户已确认的图表区间选择上下文项。 */
export type AgentSelectedTimeRangeContextItem = AgentContextItem<
  'selected-time-range',
  AgentSelectedTimeRangeContextValue
>

/** 当前选定时间范围内的完整 K 线 formatter 文本。 */
export interface AgentSelectedKLineBarsContextValue extends AgentContextObject {
  readonly content: string
}

/** 用户选择时间范围时一并提供的 K 线行情上下文项。 */
export type AgentSelectedKLineBarsContextItem = AgentContextItem<
  'selected-kline-bars',
  AgentSelectedKLineBarsContextValue
>

/** Agent 可引用的一个已选中绘图锚点。 */
export interface AgentDrawingSelectionAnchor extends AgentContextObject {
  readonly timestamp: number | null
  readonly price: number
}

/** Agent 可引用的一个已选中绘图。 */
export interface AgentDrawingSelectionDrawing extends AgentContextObject {
  readonly id: string
  readonly kind: string
  readonly paneId: string
  readonly visible: boolean
  readonly locked: boolean
  readonly zIndex: number | null
  readonly anchors: ReadonlyArray<AgentDrawingSelectionAnchor>
  readonly style: Readonly<Record<string, string | number>>
}

/** 用户当前选择的全部绘图。 */
export interface AgentDrawingSelectionContextValue extends AgentContextObject {
  readonly selectedIds: ReadonlyArray<string>
  readonly drawings: ReadonlyArray<AgentDrawingSelectionDrawing>
}

/** 用户当前选择的绘图上下文项。 */
export type AgentDrawingSelectionContextItem = AgentContextItem<
  'drawing-selection',
  AgentDrawingSelectionContextValue
>

/** 一次 Agent 运行冻结的界面上下文快照。 */
export interface AgentRunContext {
  readonly items: ReadonlyArray<AgentContextItem>
}

export type ProviderConnectionState = 'not-configured' | 'testing' | 'connected' | 'error'
export type ProviderCompatibility = 'unknown' | 'testing' | 'incompatible' | 'compatible'
export const PROVIDER_API_PROTOCOLS = ['openai-responses', 'openai-completions'] as const
export type ProviderApiProtocol = (typeof PROVIDER_API_PROTOCOLS)[number]
export const PROVIDER_REASONING_EFFORTS = ['high', 'medium', 'low', 'none'] as const
export type ProviderReasoningEffort = (typeof PROVIDER_REASONING_EFFORTS)[number]
export interface ProviderStatusView {
  state: ProviderConnectionState
  providerLabel: string
  configured?: boolean
  /** Whether a global external-service (Exa) key is saved; never carries the key itself. */
  exaConfigured?: boolean
  baseUrl?: string
  modelId?: string
  modelLabel?: string
  profileName?: string
  protocol?: ProviderApiProtocol
  headers?: Record<string, string>
  fingerprint?: string
  compatibility?: ProviderCompatibility
  lastTestedAt?: number
  lastModelsRefreshAt?: number
  contextWindow?: number
  maxOutputTokens?: number
  reasoningEfforts?: readonly ProviderReasoningEffort[]
  reasoningEffort?: ProviderReasoningEffort
  error?: AgentErrorView
}

export interface ProviderModelView {
  id: string
  name: string
  compatibility: Exclude<ProviderCompatibility, 'testing'>
  latencyMs?: number
  ttftMs?: number
  contextWindow?: number
  maxOutputTokens?: number
  reasoningEfforts?: readonly ProviderReasoningEffort[]
  defaultReasoningEffort?: ProviderReasoningEffort
}

/** 用户加入模型池的模型记录；provider 对应 Provider Profile 名称。 */
export interface ProviderModelPoolEntry extends ProviderModelView {
  provider: string
}

/** 会话目录项；标题与最近活动时间由 KQ 会话文档提供。 */
export interface AgentSessionView {
  id: string
  title: string
  updatedAt: number
}

/** UI 渲染所需的一份完整读取结果：官方会话记录、客户端条目流与官方文档。 */
export interface AgentTranscriptView {
  readonly conversation: ConversationRecord
  readonly items: readonly TranscriptItem[]
  readonly docs: Readonly<Record<string, JsonObject>>
  readonly title: string
}

export interface StartRunInput {
  sessionId: string
  prompt: string
  readOnly: boolean
  context?: AgentRunContext
}

/** 重新生成或编辑重发时定位的历史用户条目。 */
export interface BranchMessageInput {
  sessionId: string
  entryId: EntryId
  readOnly: boolean
  context?: AgentRunContext
}

export interface EditMessageInput extends BranchMessageInput {
  prompt: string
}

/** 一次运行启动后的定位信息；分支运行会返回新的会话标识。 */
export interface AgentRunStartedView {
  runId: string
  sessionId: string
}

export interface ProviderTestInput {
  baseUrl: string
  apiKey?: string
  headers?: Record<string, string>
  model: string
  protocol: ProviderApiProtocol
}
export interface ProviderSaveInput {
  baseUrl: string
  apiKey?: string
  headers?: Record<string, string>
  protocol: ProviderApiProtocol
  profileName: string
}
export interface ProviderProfileView {
  name: string
  baseUrl: string
  modelId: string
  modelName: string
  protocol: ProviderApiProtocol
  contextWindow?: number
  maxOutputTokens?: number
  reasoningEfforts?: readonly ProviderReasoningEffort[]
  reasoningEffort?: ProviderReasoningEffort
}
export interface ProviderModelsInput {
  baseUrl: string
  apiKey?: string
  headers?: Record<string, string>
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

interface EventEnvelope {
  protocolVersion: typeof AGENT_UI_PROTOCOL_VERSION
}

/** 工作区事件：会话视图、目录、Provider 状态与宿主提问。 */
export type AgentWorkspaceEvent =
  | (EventEnvelope & {
      type: 'session.changed'
      sessionId: string
      transcript: AgentTranscriptView
    })
  | (EventEnvelope & { type: 'session.closed'; sessionId: string })
  | (EventEnvelope & { type: 'sessions.changed'; sessions: AgentSessionView[] })
  | (EventEnvelope & { type: 'provider.status.changed'; status: ProviderStatusView })
  | (EventEnvelope & {
      type: 'tool.question.required'
      sessionId: string
      request: QuestionView
    })
  | (EventEnvelope & {
      type: 'tool.question.resolved'
      sessionId: string
      questionId: string
      status: 'answered' | 'cancelled'
      answer?: QuestionAnswerView
    })

export type AgentWorkspaceEventInput = AgentWorkspaceEvent extends infer Event
  ? Event extends AgentWorkspaceEvent
    ? Omit<Event, 'protocolVersion'>
    : never
  : never

export interface AgentBridgeClient {
  getContextItems(): ReadonlyArray<AgentContextItem>
  subscribeContextItems(listener: (items: ReadonlyArray<AgentContextItem>) => void): () => void
  listSessions(): Promise<AgentSessionView[]>
  openSession(sessionId: string): Promise<AgentTranscriptView>
  /** 加载更早的一页条目。 */
  loadEarlier(sessionId: string): Promise<AgentTranscriptView>
  /** 补齐条目流中的缺失区间。 */
  fillGap(sessionId: string, after: EntryId, upTo: EntryId): Promise<AgentTranscriptView>
  getProviderStatus(): Promise<ProviderStatusView>
  listTools(): Promise<AgentToolView[]>
  setToolEnabled(name: string, enabled: boolean): Promise<void>
  debugTool(name: string, input: unknown): Promise<AgentToolDebugResult>
  createSession(): Promise<AgentSessionView>
  renameSession(sessionId: string, title: string): Promise<void>
  deleteSession(sessionId: string): Promise<void>
  startRun(input: StartRunInput): Promise<AgentRunStartedView>
  cancelRun(sessionId: string): Promise<void>
  retryRun(input: BranchMessageInput): Promise<AgentRunStartedView>
  /** 编辑指定历史用户输入，并从该输入之前创建分支。 */
  editMessage(input: EditMessageInput): Promise<AgentRunStartedView>
  answerQuestion(questionId: string, answer: QuestionAnswerView): Promise<void>
  listProviderModelCatalog(): Promise<ProviderModelsResult>
  listProviderModelPool(): Promise<ProviderModelPoolEntry[]>
  addProviderModelPoolModel(model: ProviderModelView): Promise<ProviderModelPoolEntry[]>
  removeProviderModelPoolModel(modelId: string): Promise<ProviderModelPoolEntry[]>
  setProviderModel(modelId: string): Promise<void>
  testProvider(input: ProviderTestInput): Promise<ProviderTestResult>
  listProviderProfiles(): Promise<ProviderProfileView[]>
  createProviderProfile(profileName: string): Promise<void>
  renameProviderProfile(profileName: string, nextProfileName: string): Promise<void>
  deleteProviderProfile(profileName: string): Promise<void>
  selectProviderProfile(profileName: string): Promise<void>
  saveProvider(input: ProviderSaveInput): Promise<void>
  saveWebSearchApiKey(apiKey: string): Promise<void>
  setProviderReasoningEffort(effort: ProviderReasoningEffort | undefined): Promise<void>
  deleteProviderCredential(): Promise<void>
  subscribe(listener: (event: AgentWorkspaceEvent) => void): () => void
}
