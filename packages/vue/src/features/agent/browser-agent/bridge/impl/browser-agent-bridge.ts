// 浏览器 Agent bridge：组合图表上下文、Provider 持久化、会话与运行状态，对外暴露 AgentBridgeClient。

import type {
  OpenAiCompatibleProviderSettings,
  ProviderCredentialStore,
  RedactionOptions,
} from '@363045841yyt/klinechart-agent-runtime'
import {
  AGENT_UI_PROTOCOL_VERSION,
  AgentApplicationService,
  AgentRuntimeError,
  type AskUserRequest,
  createOpenAiCompatibleRuntimeSupport,
  fetchOpenAiCompatibleModels,
  normalizeProviderBaseUrl,
  PROVIDER_SETTINGS_VERSION,
} from '@363045841yyt/klinechart-agent-runtime'
import {
  type BrowserRuntimeSessions,
  createBrowserRuntimeSessions,
} from '@363045841yyt/klinechart-agent-runtime/browser'
import type { ChartAgentController } from '@363045841yyt/klinechart-core/controllers'
import type {
  AgentBridgeClient,
  AgentContextItem,
  AgentRunContext,
  AgentSessionSnapshot,
  AgentSessionView,
  AgentWorkspaceEvent,
  AgentWorkspaceEventInput,
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
import { BrowserRunRegistry } from '../../session/impl/browser-run-registry.js'
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
  private readonly createSessions: (redaction: RedactionOptions) => Promise<BrowserRuntimeSessions>
  private readonly redactionSecrets: string[] = []
  private runtimePromise: Promise<AgentApplicationService> | undefined
  private durable: BrowserRuntimeSessions | undefined
  private readonly runs = new BrowserRunRegistry()
  private readonly context: ChartContextSource
  private readonly tools: BrowserToolRegistry
  private readonly credentials: ProviderCredentialStore
  private readonly settings: BrowserProviderSettingsStore
  private readonly support
  private readonly getChartAgent: () => ChartAgentController | null | undefined

  constructor(options: BrowserAgentBridgeOptions = {}) {
    this.createSessions =
      options.createSessions ?? ((redaction) => createBrowserRuntimeSessions({ redaction }))
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
      tools: (context) => {
        const enabledNames = this.enabledToolNames()
        return this.tools.catalog
          .resolve(this.toolContext(context.readOnly))
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

  async listSessions(): Promise<AgentSessionView[]> {
    return (await this.runtime()).listSessions()
  }

  async openSession(sessionId: string): Promise<AgentSessionSnapshot> {
    return (await this.runtime()).openSession(sessionId)
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
    return this.tools.catalog
      .list(this.toolContext(false))
      .map((tool) => ({ ...tool, enabled: tool.available && enabledNames.has(tool.name) }))
  }

  /** 保存用户对当前可用工具的启用选择。 */
  async setToolEnabled(name: string, enabled: boolean): Promise<void> {
    const availability = this.tools.catalog.check(name, this.toolContext(false))
    if (!availability) {
      throw new AgentRuntimeError('INVALID_PAYLOAD', `Unknown Agent tool '${name}'.`)
    }
    if (enabled && !availability.available) {
      throw new AgentRuntimeError(
        'TOOL_NOT_ALLOWED',
        availability.unavailableReason ?? `Agent tool '${name}' is unavailable.`,
      )
    }
    const enabledNames = this.enabledToolNames()
    if (enabled) enabledNames.add(name)
    else enabledNames.delete(name)
    this.enabledTools.write(enabledNames)
  }

  /** 手动执行一个当前可用工具，复用 Agent 调用的 schema 与宿主绑定。 */
  async debugTool(name: string, input: unknown) {
    const tool = this.tools.catalog
      .resolve(this.toolContext(false))
      .find((item) => item.name === name)
    if (!tool) {
      throw new AgentRuntimeError('TOOL_NOT_ALLOWED', `Agent tool '${name}' is unavailable.`)
    }
    const result = await tool.execute(input, {
      runId: `debug:${globalThis.crypto.randomUUID()}`,
      toolCallId: `debug:${globalThis.crypto.randomUUID()}`,
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
    return this.tools.catalog.list(this.toolContext(false)).map((tool) => tool.name)
  }

  /** 返回当前 Browser 宿主中的运行时工具解析上下文。 */
  private toolContext(readOnly: boolean): BrowserToolContext {
    return { agent: this.getChartAgent(), readOnly }
  }

  /**
   * 渲染一次提问并挂起等待用户答复。
   * @param request 提问内容与选项。
   * @param context 提问所属运行、工具调用与取消信号。
   * @returns 用户答复；signal 中止时以 ABORTED 拒绝。
   */
  private async requestQuestion(
    request: AskUserRequest,
    context: { runId: string; toolCallId: string; signal: AbortSignal },
  ): Promise<QuestionAnswerView> {
    await this.runtime()
    const run = await this.durable?.sessions.findRun(context.runId)
    if (!run)
      throw new AgentRuntimeError('RUN_NOT_ACTIVE', 'Ask question requires an active Agent run.')
    const sessionId = run.sessionId
    const id = this.runs.nextQuestionId()
    return new Promise<QuestionAnswerView>((resolve, reject) => {
      const settle = () => {
        this.runs.removeQuestion(id)
        context.signal.removeEventListener('abort', onAbort)
      }
      const onAbort = () => {
        settle()
        this.emit({
          type: 'tool.question.resolved',
          runId: context.runId,
          sessionId,
          questionId: id,
          status: 'cancelled',
        })
        reject(
          new AgentRuntimeError('ABORTED', 'The Agent run ended while waiting for the answer.'),
        )
      }
      context.signal.addEventListener('abort', onAbort, { once: true })
      this.runs.addQuestion(id, {
        runId: context.runId,
        sessionId,
        resolve: (answer) => {
          settle()
          resolve(answer)
        },
      })
      this.emit({
        type: 'tool.question.required',
        runId: context.runId,
        sessionId,
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

  /** 当前生效的凭据，只在用户输入保存与提交前用于脱敏。 */
  private async secretValues(): Promise<readonly string[]> {
    const values: string[] = []
    try {
      const apiKey = await this.credentials.read()
      if (apiKey) values.push(apiKey)
    } catch {
      // 凭据不可读不应阻断运行；此时仅内置正则生效。
    }
    const exaApiKey = this.webSearchApiKey()
    if (exaApiKey) values.push(exaApiKey)
    return values
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

  /** 删除已保存配置及其模型池；删除激活配置前必须停止运行。 */
  async deleteProviderProfile(profileName: string): Promise<void> {
    const profile = this.profiles.read().find((item) => item.name === profileName)
    if (!profile) {
      throw new AgentRuntimeError('PROVIDER_ERROR', 'The Provider configuration was not found.')
    }
    if (profile.active && this.runs.activeCount) {
      throw new AgentRuntimeError(
        'RUN_ACTIVE',
        'Stop the active Agent run before deleting Provider.',
      )
    }
    this.profiles.remove(profileName)
    this.modelPool.removeGroup(profileName)
    await this.emitProviderStatus()
  }

  /** 原子切换当前运行时使用的 Provider 配置。 */
  async selectProviderProfile(profileName: string): Promise<void> {
    if (this.runs.activeCount) {
      throw new AgentRuntimeError(
        'RUN_ACTIVE',
        'Stop the active Agent run before switching Provider.',
      )
    }
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
    const settings: OpenAiCompatibleProviderSettings = {
      version: PROVIDER_SETTINGS_VERSION,
      ...connection,
      modelId: model.id,
      modelName: model.name,
      ...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
      maxOutputTokens: model.maxOutputTokens ?? 16_384,
      reasoningEfforts: model.reasoningEfforts ?? [],
      reasoningEffort: model.defaultReasoningEffort,
      compatibility: 'compatible',
      lastTestedAt: Date.now(),
      lastModelsRefreshAt: Date.now(),
    }
    this.profiles.updateActive({ settings, connection })
    await this.emitProviderStatus()
  }

  async createSession(): Promise<AgentSessionView> {
    return (await this.runtime()).createSession()
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    await (await this.runtime()).renameSession(sessionId, title)
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (this.runs.activeCount)
      throw new AgentRuntimeError('RUN_ACTIVE', 'Stop the active Agent run first.')
    await (await this.runtime()).deleteSession(sessionId)
  }

  async startRun(input: StartRunInput): Promise<{ runId: string }> {
    await this.refreshRedaction()
    const runInput: StartRunInput = {
      ...input,
      context: Object.freeze({ items: this.getContextItems() }) satisfies AgentRunContext,
    }
    return (await this.runtime()).startRun(runInput)
  }

  async cancelRun(runId: string): Promise<void> {
    await (await this.runtime()).cancelRun(runId)
  }

  async retryRun(runId: string): Promise<{ runId: string }> {
    await this.refreshRedaction()
    return (await this.runtime()).retryRun(runId)
  }

  /** 沿历史输入的 Fork 运行修改后的正文，保留该轮冻结的图表上下文。 */
  async editMessage(runId: string, prompt: string): Promise<{ runId: string }> {
    await this.refreshRedaction()
    return (await this.runtime()).editMessage(runId, prompt)
  }

  async confirmTool(): Promise<void> {
    throw new AgentRuntimeError('RUN_NOT_ACTIVE', 'No tool confirmation is pending.')
  }

  /** 把用户的回答投递给挂起中的提问，使 ask_user 工具继续执行；未知问题直接忽略。 */
  async answerQuestion(questionId: string, answer: QuestionAnswerView): Promise<void> {
    const pending = this.runs.findQuestion(questionId)
    if (!pending) return
    this.emit({
      type: 'tool.question.resolved',
      runId: pending.runId,
      sessionId: pending.sessionId,
      questionId,
      status: 'answered',
      answer,
    })
    pending.resolve(answer)
  }

  async undoTurn(): Promise<void> {
    throw new AgentRuntimeError('RUN_NOT_ACTIVE', 'No reversible tool result is available.')
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
    // localStorage。Key 统一经 credentials 存储写入——默认实现写回 localStorage（Web 端
    // 行为不变），Electron 实现写进 safeStorage。
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

  /** 惰性创建共享应用运行时，恢复历史与中断运行后才允许 UI 访问。 */
  private runtime(): Promise<AgentApplicationService> {
    this.runtimePromise ??= this.initializeRuntime()
    return this.runtimePromise
  }

  /** 统一浏览器与 Node 的会话、运行和事件持久化逻辑。 */
  private async initializeRuntime(): Promise<AgentApplicationService> {
    await this.refreshRedaction()
    const redaction = { secretValues: this.redactionSecrets }
    const durable = await this.createSessions(redaction)
    this.durable = durable
    const runtime = new AgentApplicationService({
      sessions: durable.sessions,
      createPlan: (context) => this.support.createPlan(context),
      provider: this.support.provider,
    })
    runtime.subscribe((event) => {
      if (event.type === 'session.snapshot') {
        for (const run of event.snapshot.runs) {
          if (!run.id) continue
          if (run.status === 'running' || run.status === 'cancelling') this.runs.register(run.id)
          else this.runs.complete(run.id)
        }
      }
      for (const listener of this.listeners) listener(event)
    })
    try {
      await runtime.initialize()
      if (!(await runtime.listSessions()).length) await runtime.createSession()
      return runtime
    } catch (error) {
      await durable.close()
      throw error
    }
  }

  /** 停止运行并释放浏览器数据库写锁。 */
  async close(): Promise<void> {
    if (!this.runtimePromise) return
    const runtime = await this.runtimePromise
    await runtime.interruptOwnedRuns()
    await this.durable?.close()
  }

  /** 在每次运行前更新共享脱敏名单，覆盖初始化后更改的凭据。 */
  private async refreshRedaction(): Promise<void> {
    this.redactionSecrets.splice(0, this.redactionSecrets.length, ...(await this.secretValues()))
  }

  /** 向所有 UI 事件订阅者广播，并统一补上协议版本。 */
  private emit(event: AgentWorkspaceEventInput): void {
    for (const listener of this.listeners)
      listener({ ...event, protocolVersion: AGENT_UI_PROTOCOL_VERSION })
  }
}
