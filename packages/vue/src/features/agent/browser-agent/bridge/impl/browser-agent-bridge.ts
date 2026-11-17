// 浏览器 Agent bridge：组合图表上下文、Provider 持久化与会话读取结果，实现 AgentBridgeClient。

import type { ProviderCredentialStore } from '@363045841yyt/klinechart-agent-runtime'
import {
  AGENT_UI_PROTOCOL_VERSION,
  AgentApplicationService,
  AgentRuntimeError,
  type AskUserRequest,
  createOpenAiCompatibleRuntimeSupport,
  fetchOpenAiCompatibleModels,
  normalizeProviderBaseUrl,
  PROVIDER_SETTINGS_VERSION,
  toAgentRuntimeError,
} from '@363045841yyt/klinechart-agent-runtime'
import {
  type BrowserRuntimeSessions,
  createBrowserRuntimeSessions,
} from '@363045841yyt/klinechart-agent-runtime/browser'
import { generateUUID } from '@363045841yyt/klinechart-core'
import type { ChartAgentController } from '@363045841yyt/klinechart-core/controllers'
import type {
  AgentBridgeClient,
  AgentContextItem,
  AgentRunContext,
  AgentRunMode,
  AgentRunStartedView,
  AgentSessionView,
  AgentTranscriptView,
  AgentWorkspaceEvent,
  AgentWorkspaceEventInput,
  BranchMessageInput,
  EditMessageInput,
  EntryId,
  ProviderModelPoolEntry,
  ProviderModelsResult,
  ProviderModelView,
  ProviderProfileView,
  ProviderReasoningEffort,
  ProviderSaveInput,
  ProviderStatusView,
  ProviderTestInput,
  ProviderTestResult,
  QuestionAnswerView,
  QuestionView,
  StartRunInput,
} from '../../../agent-contracts.js'
import { BrowserChartContextSource } from '../../chart-context/impl/browser-chart-context-source.js'
import type { ChartContextSource } from '../../chart-context/types.js'
import { BrowserAgentModelSettingsStore } from '../../provider/impl/browser-agent-model-settings.js'
import { BrowserEnabledTools } from '../../provider/impl/browser-enabled-tools.js'
import { fetchBrowserProvider } from '../../provider/impl/browser-provider-fetch.js'
import { BrowserProviderProfiles } from '../../provider/impl/browser-provider-profiles.js'
import {
  BrowserProviderCredentialStore,
  BrowserProviderSettingsStore,
} from '../../provider/impl/browser-provider-stores.js'
import { ProviderModelPool } from '../../provider/impl/provider-model-pool.js'
import type { BrowserProviderConnection, BrowserProviderProfile } from '../../provider/types.js'
import { BrowserPendingQuestions } from '../../session/impl/browser-pending-questions.js'
import { BrowserToolRegistry } from '../../tools/impl/browser-tool-registry.js'
import type { BrowserToolContext } from '../../tools/types.js'
import type { BrowserAgentBridgeOptions } from '../types.js'

export class BrowserAgentBridge implements AgentBridgeClient {
  private readonly listeners = new Set<(event: AgentWorkspaceEvent) => void>()
  private readonly modelSettings = new BrowserAgentModelSettingsStore()
  private readonly modelPool = new ProviderModelPool(
    () => this.modelSettings.modelPool(),
    (models) => this.modelSettings.setModelPool(models),
  )
  private readonly profiles = new BrowserProviderProfiles(this.modelSettings)
  private readonly enabledTools = new BrowserEnabledTools(this.modelSettings)
  private readonly createSessions: () => Promise<BrowserRuntimeSessions>
  private runtimePromise: Promise<AgentApplicationService> | undefined
  private durable: BrowserRuntimeSessions | undefined
  private readonly questions = new BrowserPendingQuestions()
  private readonly context: ChartContextSource
  private readonly tools: BrowserToolRegistry
  private readonly credentials: ProviderCredentialStore
  private readonly settings: BrowserProviderSettingsStore
  private readonly support
  private readonly getChartAgent: () => ChartAgentController | null | undefined

  constructor(options: BrowserAgentBridgeOptions = {}) {
    this.createSessions = options.createSessions ?? (() => createBrowserRuntimeSessions())
    this.getChartAgent = options.getChartAgent ?? (() => null)
    this.credentials = options.credentials ?? new BrowserProviderCredentialStore(this.profiles)
    this.settings = new BrowserProviderSettingsStore(this.profiles)
    this.context = new BrowserChartContextSource({ getChartAgent: this.getChartAgent })
    this.tools = new BrowserToolRegistry({
      fetch: fetchBrowserProvider,
      getWebSearchApiKey: () => this.webSearchApiKey(),
      requestQuestion: (request, context) => this.requestQuestion(request, context),
    })
    this.support = createOpenAiCompatibleRuntimeSupport({
      credentials: this.credentials,
      settings: this.settings,
      fetch: fetchBrowserProvider,
      tools: (input) => {
        const enabledNames = this.enabledToolNames()
        return this.tools
          .resolveTools(this.toolContext(input.mode))
          .filter((tool) => enabledNames.has(tool.name))
      },
    })
  }

  getContextItems(): ReadonlyArray<AgentContextItem> {
    return this.context.getItems()
  }

  subscribeContextItems(listener: (items: ReadonlyArray<AgentContextItem>) => void): () => void {
    return this.context.subscribe(listener)
  }

  /** 绑定图表 controller；支持 Agent 面板先于图表完成挂载。 */
  bindChartAgent(agent: ChartAgentController | null | undefined): void {
    this.context.bind(agent)
  }

  listSessions(): Promise<AgentSessionView[]> {
    return this.runtime().then((runtime) => runtime.listSessions())
  }

  openSession(sessionId: string): Promise<AgentTranscriptView> {
    return this.runtime().then((runtime) => runtime.openSession(sessionId))
  }

  loadEarlier(sessionId: string): Promise<AgentTranscriptView> {
    return this.runtime().then((runtime) => runtime.loadEarlier(sessionId))
  }

  fillGap(sessionId: string, after: EntryId, upTo: EntryId): Promise<AgentTranscriptView> {
    return this.runtime().then((runtime) => runtime.fillGap(sessionId, after, upTo))
  }

  async getProviderStatus(): Promise<ProviderStatusView> {
    const status = await this.support.provider.getStatus()
    const profile = this.profiles.active()
    const exaConfigured = Boolean(this.webSearchApiKey())
    if (!profile) return { ...status, exaConfigured }
    const connection = profile.connection
    if (!connection) return { ...status, profileName: profile.name, exaConfigured }
    if (profile.settings) return { ...status, profileName: profile.name, exaConfigured }
    return {
      state: 'not-configured',
      providerLabel: 'OpenAI-compatible',
      configured: true,
      baseUrl: connection.baseUrl,
      headers: connection.headers,
      protocol: connection.protocol,
      profileName: profile.name,
      exaConfigured,
      compatibility: 'unknown',
    }
  }

  /** 读取最新 Provider 状态并广播，供设置面板与状态栏同步。 */
  private async emitProviderStatus(): Promise<void> {
    this.emit({ type: 'provider.status.changed', status: await this.getProviderStatus() })
  }

  /** 返回当前 Browser 宿主中可管理的图表与网络工具。 */
  async listTools() {
    const enabledNames = this.enabledToolNames()
    return this.tools.listTools().map((tool) => ({ ...tool, enabled: enabledNames.has(tool.name) }))
  }

  /** 保存用户对当前可用工具的启用选择。 */
  async setToolEnabled(name: string, enabled: boolean): Promise<void> {
    if (!this.tools.listTools().some((tool) => tool.name === name)) {
      throw new AgentRuntimeError('INVALID_PAYLOAD', `Unknown Agent tool '${name}'.`)
    }
    const enabledNames = this.enabledToolNames()
    if (enabled) enabledNames.add(name)
    else enabledNames.delete(name)
    this.enabledTools.write(enabledNames)
  }

  /** 手动执行一个当前可用工具，复用 Agent 调用的 schema 与宿主绑定。 */
  async debugTool(name: string, input: unknown) {
    const tool = this.tools
      .resolveTools(this.toolContext('build'))
      .find((item) => item.name === name)
    if (!tool) {
      throw new AgentRuntimeError('TOOL_NOT_ALLOWED', `Agent tool '${name}' is unavailable.`)
    }
    const result = await tool.execute(input, {
      sessionId: 'debug',
      runId: `debug:${generateUUID()}`,
      toolCallId: `debug:${generateUUID()}`,
      signal: new AbortController().signal,
      progress: () => undefined,
    })
    return { content: result.content, summary: result.summary }
  }

  /** 读取当前可用工具的启用集合，并忽略旧版本遗留的未知名称。 */
  private enabledToolNames(): Set<string> {
    const registeredNames = this.availableToolNames()
    const enabledNames = this.enabledTools.read(registeredNames)
    return new Set([...enabledNames].filter((name) => registeredNames.includes(name)))
  }

  /** 返回当前配置可用的图表与网络工具名称。 */
  private availableToolNames(): readonly string[] {
    return this.tools.listTools().map((tool) => tool.name)
  }

  /** 返回当前 Browser 宿主中的运行时工具解析上下文。 */
  private toolContext(mode: AgentRunMode): BrowserToolContext {
    return { agent: this.getChartAgent(), mode }
  }

  /**
   * 渲染一次提问并挂起等待用户答复。
   * @param request 提问内容与选项。
   * @param context 提问所属会话、工具调用与取消信号。
   * @returns 用户答复；signal 中止时以 ABORTED 拒绝。
   */
  private async requestQuestion(
    request: AskUserRequest,
    context: { sessionId: string; toolCallId: string; signal: AbortSignal },
  ): Promise<QuestionAnswerView> {
    const id = this.questions.nextId()
    return new Promise<QuestionAnswerView>((resolve, reject) => {
      const settle = () => {
        this.questions.remove(id)
        context.signal.removeEventListener('abort', onAbort)
      }
      const onAbort = () => {
        settle()
        this.emit({
          type: 'tool.question.resolved',
          sessionId: context.sessionId,
          questionId: id,
          status: 'cancelled',
        })
        reject(
          new AgentRuntimeError('ABORTED', 'The Agent run ended while waiting for the answer.'),
        )
      }
      context.signal.addEventListener('abort', onAbort, { once: true })
      this.questions.add(id, {
        sessionId: context.sessionId,
        resolve: (answer) => {
          settle()
          resolve(answer)
        },
      })
      this.emit({
        type: 'tool.question.required',
        sessionId: context.sessionId,
        request: {
          id,
          toolCallId: context.toolCallId,
          prompt: request.prompt,
          options: request.options,
          multiSelect: request.multiSelect,
          status: 'pending',
        } satisfies QuestionView,
      })
    })
  }

  /** 返回全局保存的 Web Search 凭据。 */
  private webSearchApiKey(): string | undefined {
    return this.modelSettings.webSearchApiKey()
  }

  /** 返回已保存的 Provider 配置，不向界面暴露 API Key。 */
  async listProviderProfiles(): Promise<ProviderProfileView[]> {
    return this.profiles.read().map((profile) => {
      const connection = profile.connection
      const settings = profile.settings
      return {
        name: profile.name,
        baseUrl: connection?.baseUrl ?? '',
        modelId: settings?.modelId ?? '',
        modelName: settings?.modelName ?? '',
        protocol: connection?.protocol ?? 'openai-responses',
        contextWindow: settings?.contextWindow,
        maxOutputTokens: settings?.maxOutputTokens,
        reasoningEfforts: settings?.reasoningEfforts,
        reasoningEffort: settings?.reasoningEffort,
      }
    })
  }

  /** 在唯一配置数组中创建并激活一个空配置。 */
  async createProviderProfile(profileName: string): Promise<void> {
    const profiles = this.profiles.read()
    if (profiles.some((profile) => profile.name === profileName)) {
      throw new AgentRuntimeError(
        'PROVIDER_ERROR',
        'The Provider configuration name is already in use.',
      )
    }
    this.profiles.write([
      ...profiles.map((profile) => ({ ...profile, active: false })),
      {
        name: profileName,
        apiKey: '',
        active: true,
      },
    ])
    await this.emitProviderStatus()
  }

  /** 重命名已保存配置，并同步其模型池分组。 */
  async renameProviderProfile(profileName: string, nextProfileName: string): Promise<void> {
    const nextName = nextProfileName.trim()
    if (!profileName || !nextName) {
      throw new AgentRuntimeError('PROVIDER_ERROR', 'The Provider configuration name is required.')
    }
    const profiles = this.profiles.read()
    if (!profiles.some((profile) => profile.name === profileName)) {
      throw new AgentRuntimeError('PROVIDER_ERROR', 'The Provider configuration was not found.')
    }
    if (nextName === profileName) return
    if (profiles.some((profile) => profile.name === nextName)) {
      throw new AgentRuntimeError(
        'PROVIDER_ERROR',
        'The Provider configuration name is already in use.',
      )
    }
    this.profiles.rename(profileName, nextName)
    this.modelPool.renameGroup(profileName, nextName)
    await this.emitProviderStatus()
  }

  /** 删除已保存配置及其模型池。 */
  async deleteProviderProfile(profileName: string): Promise<void> {
    const profile = this.profiles.read().find((item) => item.name === profileName)
    if (!profile) {
      throw new AgentRuntimeError('PROVIDER_ERROR', 'The Provider configuration was not found.')
    }
    this.profiles.remove(profileName)
    this.modelPool.removeGroup(profileName)
    await this.emitProviderStatus()
  }

  /** 原子切换当前运行时使用的 Provider 配置。 */
  async selectProviderProfile(profileName: string): Promise<void> {
    const profile = this.profiles.read().find((item) => item.name === profileName)
    if (!profile)
      throw new AgentRuntimeError('PROVIDER_ERROR', 'The Provider configuration was not found.')
    this.profiles.select(profile.name)
    await this.emitProviderStatus()
  }

  /** 使用当前已保存的 Provider 连接拉取模型目录。 */
  async listProviderModelCatalog(): Promise<ProviderModelsResult> {
    const profile = this.profiles.active()
    const connection = profile?.connection
    if (!connection) {
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'The active Provider has no saved connection.',
      )
    }
    return fetchOpenAiCompatibleModels({ ...connection, apiKey: await this.credentials.read() })
  }

  /** 返回当前 Profile 在统一模型池中可用的模型。 */
  async listProviderModelPool(): Promise<ProviderModelPoolEntry[]> {
    const profile = this.profiles.active()
    return profile ? this.modelPool.list(profile.name) : []
  }

  /** 将远端目录模型加入当前 Profile 的模型池，并返回更新后的模型池。 */
  async addProviderModelPoolModel(model: ProviderModelView): Promise<ProviderModelPoolEntry[]> {
    const profile = this.profiles.active()
    if (!profile) return []
    this.modelPool.add(profile.name, model)
    return this.modelPool.list(profile.name)
  }

  /** 从当前 Profile 模型池移除模型；若移除的是已选模型则同时清除选择。 */
  async removeProviderModelPoolModel(modelId: string): Promise<ProviderModelPoolEntry[]> {
    const profile = this.profiles.active()
    if (!profile) return []
    this.modelPool.remove(profile.name, modelId)
    if (profile.settings?.modelId === modelId) {
      this.profiles.updateActive({ settings: undefined })
    }
    await this.emitProviderStatus()
    return this.modelPool.list(profile.name)
  }

  /** 选择当前 Profile 模型池中的模型，并同步该模型声明的能力。 */
  async setProviderModel(modelId: string): Promise<void> {
    const profile = this.profiles.active()
    const connection = profile?.connection
    if (!profile || !connection) return
    const model = this.modelPool.list(profile.name).find((item) => item.id === modelId)
    if (!model)
      throw new AgentRuntimeError('PROVIDER_ERROR', 'The model is not in this Provider model pool.')
    const settings = {
      version: PROVIDER_SETTINGS_VERSION,
      ...connection,
      modelId: model.id,
      modelName: model.name,
      ...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
      maxOutputTokens: model.maxOutputTokens ?? 16_384,
      reasoningEfforts: model.reasoningEfforts ?? [],
      reasoningEffort: model.defaultReasoningEffort,
      compatibility: 'compatible' as const,
      lastTestedAt: Date.now(),
      lastModelsRefreshAt: Date.now(),
    }
    this.profiles.updateActive({ settings, connection })
    await this.emitProviderStatus()
  }

  async createSession(): Promise<AgentSessionView> {
    return this.runtime().then(async (runtime) => {
      const session = await runtime.createSession()
      return session
    })
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    await (await this.runtime()).renameSession(sessionId, title)
  }

  async deleteSession(sessionId: string): Promise<void> {
    await (await this.runtime()).deleteSession(sessionId)
  }

  /** 提交运行，并把当前图表上下文冻结进运行计划。 */
  async startRun(input: StartRunInput): Promise<AgentRunStartedView> {
    const runInput: StartRunInput = {
      ...input,
      context: Object.freeze({ items: this.getContextItems() }) satisfies AgentRunContext,
    }
    return (await this.runtime()).startRun(runInput)
  }

  cancelRun(sessionId: string): Promise<void> {
    return this.runtime().then((runtime) => runtime.cancelRun(sessionId))
  }

  /** 重新生成：Bridge 负责补上当前上下文并返回分支后的会话标识。 */
  async retryRun(input: BranchMessageInput): Promise<AgentRunStartedView> {
    return (await this.runtime()).retryRun({
      ...input,
      context: Object.freeze({ items: this.getContextItems() }) satisfies AgentRunContext,
    })
  }

  /** 编辑重发：在该用户输入之前创建分支并提交新正文。 */
  async editMessage(input: EditMessageInput): Promise<AgentRunStartedView> {
    return (await this.runtime()).editMessage({
      ...input,
      context: Object.freeze({ items: this.getContextItems() }) satisfies AgentRunContext,
    })
  }

  /** 把用户的回答投递给挂起中的提问，使 ask_user 工具继续执行；未知问题直接忽略。 */
  async answerQuestion(questionId: string, answer: QuestionAnswerView): Promise<void> {
    const pending = this.questions.find(questionId)
    if (!pending) return
    this.emit({
      type: 'tool.question.resolved',
      sessionId: pending.sessionId,
      questionId,
      status: 'answered',
      answer,
    })
    pending.resolve(answer)
  }

  async testProvider(input: ProviderTestInput): Promise<ProviderTestResult> {
    const apiKey = input.apiKey?.trim() || (await this.credentials.read())
    if (!apiKey) {
      throw new AgentRuntimeError('PROVIDER_NOT_CONFIGURED', 'Enter an API key before testing.')
    }
    return await this.support.provider.test({ ...input, apiKey })
  }

  async saveProvider(input: ProviderSaveInput): Promise<void> {
    const profileName = input.profileName.trim()
    if (!profileName) {
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'Enter a configuration name before saving.',
      )
    }
    const baseUrl = normalizeProviderBaseUrl(input.baseUrl)
    const profiles = this.profiles.read()
    const existingIndex = profiles.findIndex((item) => item.name === profileName)
    const previousProfile = profiles[existingIndex]
    const connection: BrowserProviderConnection = {
      baseUrl,
      headers: input.headers ?? {},
      protocol: input.protocol,
    }
    const previousConnection = previousProfile?.connection
    const connectionChanged =
      previousConnection !== undefined &&
      (previousConnection.baseUrl !== connection.baseUrl ||
        previousConnection.protocol !== connection.protocol)
    const pool = this.modelPool.list(profileName)
    const settings =
      !connectionChanged &&
      previousProfile?.settings &&
      pool.some((model) => model.id === previousProfile.settings?.modelId)
        ? previousProfile.settings
        : undefined
    // apiKey 一律不进 profile 对象：它随 profiles.write() 会被 JSON.stringify 进
    // localStorage。Key 统一经 credentials 存储写入。
    const apiKey = input.apiKey?.trim() || (await this.credentials.read()) || ''
    const profile: BrowserProviderProfile = {
      name: profileName,
      apiKey: '',
      settings,
      connection,
      active: true,
    }
    if (connectionChanged) {
      this.modelPool.removeGroup(profileName)
    }
    this.profiles.write(
      (existingIndex >= 0
        ? profiles.map((item, index) => (index === existingIndex ? profile : item))
        : [...profiles, profile]
      ).map((item) => ({ ...item, active: item.name === profileName })),
    )
    if (apiKey) await this.credentials.write(apiKey)
    await this.emitProviderStatus()
  }

  /** 保存独立于 Provider Profile 的全局 Web Search 凭据。 */
  async saveWebSearchApiKey(apiKey: string): Promise<void> {
    this.modelSettings.setWebSearchApiKey(apiKey)
    await this.emitProviderStatus()
  }

  /** 更新当前 Profile 的思考强度并保持已验证模型能力不变。 */
  async setProviderReasoningEffort(effort: ProviderReasoningEffort | undefined): Promise<void> {
    const active = this.profiles.active()
    const settings = active?.settings
    if (!settings) return
    if (effort && !settings.reasoningEfforts.includes(effort)) {
      throw new AgentRuntimeError(
        'PROVIDER_ERROR',
        'The selected model does not support this reasoning effort.',
      )
    }
    this.profiles.updateActive({ settings: { ...settings, reasoningEffort: effort } })
    await this.emitProviderStatus()
  }

  async deleteProviderCredential(): Promise<void> {
    await this.support.provider.deleteCredential()
    await this.emitProviderStatus()
  }

  subscribe(listener: (event: AgentWorkspaceEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * 惰性创建共享应用运行时。
   * 初始化失败时不缓存 rejected promise，使外部锁释放后再次调用可以重试。
   */
  private runtime(): Promise<AgentApplicationService> {
    this.runtimePromise ??= this.initializeRuntime().catch((error: unknown) => {
      this.runtimePromise = undefined
      throw toAgentRuntimeError(error)
    })
    return this.runtimePromise
  }

  /** 统一浏览器与 Node 的会话、运行和事件持久化逻辑。 */
  private async initializeRuntime(): Promise<AgentApplicationService> {
    const durable = await this.createSessions()
    try {
      const runtime = new AgentApplicationService({
        sessions: durable.sessions,
        createPlan: (input) => this.support.createPlan(input),
        provider: this.support.provider,
      })
      runtime.subscribe((event) => {
        for (const listener of this.listeners) listener(event)
      })
      if (!(await runtime.listSessions()).length) await runtime.createSession()
      this.durable = durable
      return runtime
    } catch (error) {
      await durable.close()
      throw error
    }
  }

  /** 停止运行并释放浏览器数据库写锁；可重复调用，初始化失败时同样安全。 */
  async close(): Promise<void> {
    const pending = this.runtimePromise
    this.runtimePromise = undefined
    if (!pending) return
    const runtime = await pending.catch(() => undefined)
    if (!runtime) return
    await runtime.close()
    await this.durable?.close()
    this.durable = undefined
  }

  /** 向所有 UI 事件订阅者广播，并统一补上协议版本。 */
  private emit(event: AgentWorkspaceEventInput): void {
    for (const listener of this.listeners)
      listener({ ...event, protocolVersion: AGENT_UI_PROTOCOL_VERSION })
  }
}
