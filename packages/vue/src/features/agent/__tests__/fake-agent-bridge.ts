// 测试用 Bridge：只用官方条目形状的内存会话，不复制生产端的投影与状态机。
import { type ConversationId, type EntryId, LiveDoc } from '@earendil-works/pi-durable'
import type {
  AgentClient,
  AgentContextItem,
  AgentRunStartedView,
  AgentSessionLease,
  AgentSessionView,
  AgentTranscriptView,
  AgentWorkspaceEvent,
  AgentWorkspaceEventInput,
  BranchMessageInput,
  ContinueRunInput,
  EditMessageInput,
  EntryRecord,
  JsonObject,
  ProviderCatalogView,
  ProviderSnapshot,
  RunFailureReason,
  StartRunInput,
  ToolCall,
  TranscriptItem,
} from '../agent-contracts.js'
import { AGENT_UI_PROTOCOL_VERSION } from '../agent-contracts.js'

/** 测试桥梁里记录的运行失败：写入官方 `pi.live.runFailure`，与生产读取路径一致。 */
interface FakeRunFailure {
  readonly reason: RunFailureReason
  readonly detail?: string
}

/** 未配置 Provider 的空快照；工作区据此判断需要打开设置。 */
const EMPTY_PROVIDER_SNAPSHOT: ProviderSnapshot = {
  revision: 0,
  profiles: [],
  activeProfileId: null,
  connection: null,
  connectionRevision: 0,
  credentialPresent: false,
  models: [],
  selectedModelId: null,
  exaConfigured: false,
}

/** Provider 写命令不在夹具范围内：显式失败，提示改用真实宿主测试。 */
function unsupportedProviderCommand(name: string): Promise<never> {
  return Promise.reject(
    new Error(`FakeAgentBridge.${name} is not modeled here; use the real host fixture instead.`),
  )
}

/** 内存 Bridge：确定性内容，用于组件与工作区测试。 */
export class FakeAgentBridge implements AgentClient {
  private readonly listeners = new Set<(event: AgentWorkspaceEvent) => void>()
  private readonly contextListeners = new Set<(items: ReadonlyArray<AgentContextItem>) => void>()
  private readonly entries = new Map<string, EntryRecord[]>()
  private readonly sessions: AgentSessionView[] = []
  private readonly runFailures = new Map<string, FakeRunFailure>()
  private nextId = 1

  constructor(options: { sessions?: AgentSessionView[] } = {}) {
    const initial = options.sessions ?? [{ id: '1', title: 'Session 1', updatedAt: 1 }]
    for (const session of initial) {
      this.sessions.push({ ...session })
      this.entries.set(session.id, [])
    }
  }

  getContextItems(): ReadonlyArray<AgentContextItem> {
    return []
  }

  subscribeContextItems(listener: (items: ReadonlyArray<AgentContextItem>) => void): () => void {
    this.contextListeners.add(listener)
    return () => this.contextListeners.delete(listener)
  }

  async listSessions(): Promise<AgentSessionView[]> {
    return this.sessions.map((session) => ({ ...session }))
  }

  async openSession(sessionId: string): Promise<AgentSessionLease> {
    return { sessionId, transcript: this.view(sessionId), release: async () => undefined }
  }

  async loadEarlier(sessionId: string): Promise<AgentTranscriptView> {
    return this.view(sessionId)
  }

  async fillGap(sessionId: string): Promise<AgentTranscriptView> {
    return this.view(sessionId)
  }

  async createSession(): Promise<AgentSessionView> {
    const session = {
      id: String(this.nextId++),
      title: 'New session',
      updatedAt: Date.now(),
    }
    this.sessions.push(session)
    this.entries.set(session.id, [])
    this.emit({ type: 'sessions.changed', sessions: await this.listSessions() })
    return session
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    const session = this.sessions.find((item) => item.id === sessionId)
    if (!session) return
    session.title = title.trim()
    this.emit({ type: 'sessions.changed', sessions: await this.listSessions() })
  }

  async deleteSession(sessionId: string): Promise<void> {
    const index = this.sessions.findIndex((item) => item.id === sessionId)
    if (index >= 0) this.sessions.splice(index, 1)
    this.entries.delete(sessionId)
    this.emit({ type: 'session.closed', sessionId })
    this.emit({ type: 'sessions.changed', sessions: await this.listSessions() })
  }

  async startRun(input: StartRunInput): Promise<AgentRunStartedView> {
    const runId = `run-${this.nextId++}`
    this.appendRound(input.sessionId, input.prompt, input.prompt)
    return { runId, sessionId: input.sessionId }
  }

  async cancelRun(): Promise<void> {
    return undefined
  }

  async retryRun(input: BranchMessageInput): Promise<AgentRunStartedView> {
    const entries = this.entries.get(input.sessionId) ?? []
    const target = entries.findIndex((entry) => entry.id === input.entryId)
    const prompt = this.userText(entries[target]) ?? 'Retried prompt'
    if (target >= 0) entries.splice(target)
    const runId = `run-${this.nextId++}`
    this.appendRound(input.sessionId, prompt, prompt)
    return { runId, sessionId: input.sessionId }
  }

  /** 继续运行：不追加用户消息，只补一轮回答。 */
  async continueRun(input: ContinueRunInput): Promise<AgentRunStartedView> {
    const runId = `run-${this.nextId++}`
    this.appendRound(input.sessionId, 'Continue the run')
    return { runId, sessionId: input.sessionId }
  }

  async editMessage(input: EditMessageInput): Promise<AgentRunStartedView> {
    const entries = this.entries.get(input.sessionId) ?? []
    const target = entries.findIndex((entry) => entry.id === input.entryId)
    if (target >= 0) entries.splice(target)
    const runId = `run-${this.nextId++}`
    this.appendRound(input.sessionId, input.prompt, input.prompt)
    return { runId, sessionId: input.sessionId }
  }

  /** 模拟一次没有作答的运行：写入官方 `pi.live.runFailure` 并广播读取结果。 */
  failRun(sessionId: string, failure: FakeRunFailure): void {
    this.runFailures.set(sessionId, failure)
    this.emit({ type: 'session.changed', sessionId, transcript: this.view(sessionId) })
  }

  /** 内存 Bridge 不模拟宿主提问：挂起与结算只存在于真实 Bridge。 */
  async answerQuestion(): Promise<void> {
    return undefined
  }

  async cancelQuestion(): Promise<void> {
    return undefined
  }

  // ── Provider 命令不在本夹具范围内 ───────────────────────────────────────
  // 这些测试只覆盖会话与运行投影；Provider 行为测试使用真实宿主
  // （`@363045841yyt/klinechart-agent-runtime/testing`）。夹具只提供空快照，
  // 任何写命令都直接失败，避免在测试里长出一套平行实现。

  /** 空 Provider 快照；工作区因此处于未配置状态。 */
  async snapshot(): Promise<ProviderSnapshot> {
    return structuredClone(EMPTY_PROVIDER_SNAPSHOT)
  }

  createProfile(): Promise<ProviderSnapshot> {
    return unsupportedProviderCommand('createProfile')
  }

  renameProfile(): Promise<ProviderSnapshot> {
    return unsupportedProviderCommand('renameProfile')
  }

  deleteProfile(): Promise<ProviderSnapshot> {
    return unsupportedProviderCommand('deleteProfile')
  }

  selectProfile(): Promise<ProviderSnapshot> {
    return unsupportedProviderCommand('selectProfile')
  }

  saveConnection(): Promise<ProviderSnapshot> {
    return unsupportedProviderCommand('saveConnection')
  }

  refreshCatalog(): Promise<ProviderCatalogView> {
    return unsupportedProviderCommand('refreshCatalog')
  }

  addModel(): Promise<ProviderSnapshot> {
    return unsupportedProviderCommand('addModel')
  }

  removeModel(): Promise<ProviderSnapshot> {
    return unsupportedProviderCommand('removeModel')
  }

  selectModel(): Promise<ProviderSnapshot> {
    return unsupportedProviderCommand('selectModel')
  }

  setReasoningEffort(): Promise<ProviderSnapshot> {
    return unsupportedProviderCommand('setReasoningEffort')
  }

  saveExaKey(): Promise<ProviderSnapshot> {
    return unsupportedProviderCommand('saveExaKey')
  }

  async listTools() {
    return []
  }

  async setToolEnabled(): Promise<void> {
    return undefined
  }

  async debugTool() {
    return { content: '', summary: '' }
  }

  subscribe(listener: (event: AgentWorkspaceEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 读取用户条目正文。 */
  private userText(entry: EntryRecord | undefined): string | undefined {
    const message = entry?.model?.[0]
    if (message?.role !== 'user') return undefined
    return typeof message.content === 'string' ? message.content : ''
  }

  /** 追加一轮确定性运行并广播视图；带 input 时先落一条官方用户条目。 */
  private appendRound(sessionId: string, request: string, input?: string): void {
    const entries = this.entries.get(sessionId)
    const session = this.sessions.find((item) => item.id === sessionId)
    if (!entries || !session) return
    const conversationId = Number(sessionId) as ConversationId
    const push = (kind: string, model: EntryRecord['model']): void => {
      entries.push({
        id: this.nextId++ as EntryId,
        conversationId,
        kind,
        model,
      })
    }
    const timestamp = Date.now()
    if (input !== undefined) push('pi.user', [{ role: 'user', content: input, timestamp }])
    const call: ToolCall = {
      type: 'toolCall',
      id: `call-${this.nextId++}`,
      name: 'chart.inspect',
      arguments: { request },
    }
    push('pi.assistant', [
      {
        role: 'assistant',
        content: [{ type: 'thinking', thinking: 'Inspecting the chart context.' }, call],
        api: 'openai-responses',
        provider: 'fake',
        model: 'fake-model',
        usage: {
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'toolUse',
        timestamp,
      },
    ])
    push('pi.tool-result', [
      {
        role: 'toolResult',
        toolCallId: call.id,
        toolName: call.name,
        content: [{ type: 'text', text: `Result for ${request}` }],
        details: {
          label: 'Inspect chart context',
          inputSummary: request,
          summary: 'Chart context inspected.',
        },
        isError: false,
        timestamp,
      },
    ])
    push('pi.assistant', [
      {
        role: 'assistant',
        content: [{ type: 'text', text: `Answer to: ${request}` }],
        api: 'openai-responses',
        provider: 'fake',
        model: 'fake-model',
        usage: {
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp,
      },
    ])
    session.updatedAt = timestamp
    this.emit({
      type: 'session.changed',
      sessionId,
      transcript: this.view(sessionId),
    })
    this.emit({ type: 'sessions.changed', sessions: this.sessions.map((item) => ({ ...item })) })
  }

  /** 由内存条目构造只读读取结果；运行失败按官方文档形状写入 `pi.live`。 */
  private view(sessionId: string): AgentTranscriptView {
    const session = this.sessions.find((item) => item.id === sessionId)
    const entries = this.entries.get(sessionId) ?? []
    const items: TranscriptItem[] = entries.map((entry) => ({ kind: 'entry', entry }))
    const docs: Record<string, JsonObject> = {}
    const failure = this.runFailures.get(sessionId)
    if (failure) docs[LiveDoc.definition.kind] = { runFailure: { ...failure } }
    return {
      conversation: { id: Number(sessionId) as ConversationId },
      items,
      docs,
      title: session?.title ?? '',
    }
  }

  /** 广播事件。 */
  private emit(event: AgentWorkspaceEventInput): void {
    const next: AgentWorkspaceEvent = { ...event, protocolVersion: AGENT_UI_PROTOCOL_VERSION }
    for (const listener of this.listeners) listener(next)
  }
}
