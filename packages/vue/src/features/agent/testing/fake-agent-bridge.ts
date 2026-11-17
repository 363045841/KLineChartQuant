// 测试用 Bridge：只用官方条目形状的内存会话，不复制生产端的投影与状态机。
import { type ConversationId, type EntryId, LiveDoc } from '@earendil-works/pi-durable'
import type {
  AgentBridgeClient,
  AgentContextItem,
  AgentRunStartedView,
  AgentSessionView,
  AgentTranscriptView,
  AgentWorkspaceEvent,
  AgentWorkspaceEventInput,
  BranchMessageInput,
  ContinueRunInput,
  EditMessageInput,
  EntryRecord,
  JsonObject,
  ProviderModelPoolEntry,
  ProviderModelsResult,
  ProviderModelView,
  ProviderProfileView,
  ProviderReasoningEffort,
  ProviderSaveInput,
  ProviderStatusView,
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

interface FakeProfile {
  name: string
  connection?: {
    baseUrl: string
    headers: Record<string, string>
    protocol: 'openai-responses' | 'openai-completions'
  }
  settings?: ProviderProfileView
  pool: ProviderModelView[]
}

/** 内存 Bridge：确定性内容，用于组件与工作区测试。 */
export class FakeAgentBridge implements AgentBridgeClient {
  private readonly listeners = new Set<(event: AgentWorkspaceEvent) => void>()
  private readonly contextListeners = new Set<(items: ReadonlyArray<AgentContextItem>) => void>()
  private readonly entries = new Map<string, EntryRecord[]>()
  private readonly sessions: AgentSessionView[] = []
  private readonly runFailures = new Map<string, FakeRunFailure>()
  private readonly profiles: FakeProfile[] = []
  private nextId = 1
  private exaConfigured = false
  /** 当前激活的 Profile 名称。 */
  private active = ''

  constructor(options: { providerConfigured?: boolean; sessions?: AgentSessionView[] } = {}) {
    const initial = options.sessions ?? [{ id: '1', title: 'Session 1', updatedAt: 1 }]
    for (const session of initial) {
      this.sessions.push({ ...session })
      this.entries.set(session.id, [])
    }
    if (options.providerConfigured) {
      this.profiles.push({
        name: 'Default',
        pool: [],
        connection: {
          baseUrl: 'https://provider.example/v1',
          headers: {},
          protocol: 'openai-responses',
        },
        settings: {
          name: 'Default',
          baseUrl: 'https://provider.example/v1',
          modelId: 'fake-model',
          modelName: 'Fake model',
          protocol: 'openai-responses',
        },
      })
      this.active = 'Default'
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

  async openSession(sessionId: string): Promise<AgentTranscriptView> {
    return this.view(sessionId)
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

  async getProviderStatus(): Promise<ProviderStatusView> {
    const profile = this.activeProfile()
    const configured = Boolean(profile?.connection)
    return {
      state: profile?.settings ? 'connected' : 'not-configured',
      providerLabel: 'OpenAI-compatible',
      configured,
      profileName: profile?.name,
      baseUrl: profile?.connection?.baseUrl,
      protocol: profile?.connection?.protocol,
      modelId: profile?.settings?.modelId,
      exaConfigured: this.exaConfigured,
    }
  }

  async listProviderProfiles(): Promise<ProviderProfileView[]> {
    return this.profiles.map((profile) => ({
      name: profile.name,
      baseUrl: profile.connection?.baseUrl ?? '',
      protocol: profile.connection?.protocol ?? 'openai-responses',
      modelId: profile.settings?.modelId ?? '',
      modelName: profile.settings?.modelName ?? '',
    }))
  }

  async listProviderModelCatalog(): Promise<ProviderModelsResult> {
    return { models: this.activeProfile()?.pool ?? [], refreshedAt: Date.now() }
  }

  async listProviderModelPool(): Promise<ProviderModelPoolEntry[]> {
    const profile = this.activeProfile()
    return profile ? profile.pool.map((model) => ({ ...model, provider: profile.name })) : []
  }

  async addProviderModelPoolModel(model: ProviderModelView): Promise<ProviderModelPoolEntry[]> {
    const profile = this.activeProfile()
    if (!profile) return []
    if (!profile.pool.some((item) => item.id === model.id)) profile.pool.push(model)
    return this.listProviderModelPool()
  }

  async removeProviderModelPoolModel(modelId: string): Promise<ProviderModelPoolEntry[]> {
    const profile = this.activeProfile()
    if (!profile) return []
    profile.pool = profile.pool.filter((model) => model.id !== modelId)
    if (profile.settings?.modelId === modelId) profile.settings = undefined
    return this.listProviderModelPool()
  }

  async setProviderModel(modelId: string): Promise<void> {
    const profile = this.activeProfile()
    const model = profile?.pool.find((item) => item.id === modelId)
    if (!profile || !model) return
    profile.settings = {
      name: profile.name,
      baseUrl: profile.connection?.baseUrl ?? '',
      protocol: profile.connection?.protocol ?? 'openai-responses',
      modelId: model.id,
      modelName: model.name,
      ...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
      ...(model.maxOutputTokens === undefined ? {} : { maxOutputTokens: model.maxOutputTokens }),
    }
  }

  async saveProvider(input: ProviderSaveInput): Promise<void> {
    const name = input.profileName.trim()
    let profile = this.profiles.find((item) => item.name === name)
    if (!profile) {
      profile = { name, pool: [] }
      this.profiles.push(profile)
    }
    profile.connection = {
      baseUrl: input.baseUrl,
      headers: input.headers ?? {},
      protocol: input.protocol,
    }
    this.active = name
  }

  async createProviderProfile(profileName: string): Promise<void> {
    if (!this.profiles.some((item) => item.name === profileName)) {
      this.profiles.push({ name: profileName, pool: [] })
    }
  }

  async renameProviderProfile(profileName: string, nextProfileName: string): Promise<void> {
    const profile = this.profiles.find((item) => item.name === profileName)
    if (!profile) return
    profile.name = nextProfileName
    if (profile.settings) profile.settings = { ...profile.settings, name: nextProfileName }
  }

  async deleteProviderProfile(profileName: string): Promise<void> {
    const index = this.profiles.findIndex((item) => item.name === profileName)
    if (index >= 0) this.profiles.splice(index, 1)
  }

  async selectProviderProfile(profileName: string): Promise<void> {
    this.active = profileName
  }

  async setProviderReasoningEffort(effort: ProviderReasoningEffort | undefined): Promise<void> {
    const settings = this.activeProfile()?.settings
    if (settings) settings.reasoningEffort = effort
  }

  async deleteProviderCredential(): Promise<void> {
    const profile = this.activeProfile()
    if (profile) profile.settings = undefined
  }

  async saveWebSearchApiKey(apiKey: string): Promise<void> {
    this.exaConfigured = apiKey.length > 0
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

  /** 当前激活的 Profile 名称。 */
  private activeProfile(): FakeProfile | undefined {
    return this.profiles.find((item) => item.name === this.active) ?? this.profiles[0]
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
