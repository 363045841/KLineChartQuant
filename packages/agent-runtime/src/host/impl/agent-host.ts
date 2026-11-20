/**
 * Agent 宿主：一个 origin 唯一的会话、Provider 与运行编排所有者。
 *
 * 宿主运行在 SharedWorker 中，只通过协议与页面交互：
 * - 会话、模型、Provider 配置直接落在宿主的 IndexedDB；
 * - 图表工具与用户提问经 `tools.execute` / `questions.ask` 路由回发起页；
 * - 事件统一广播给已接入页面，页面只做展示与转发。
 */

import type { EntryId } from '@earendil-works/pi-durable'
import { AgentApplicationService } from '../../application/agent-application-service.js'
import type { RunPlanInput } from '../../application/types.js'
import {
  AgentRuntimeError,
  agentRuntimeErrorFromView,
  toAgentRuntimeError,
} from '../../contracts/errors.js'
import type {
  AgentSessionView,
  AgentToolDebugResult,
  AgentToolView,
  AgentTranscriptView,
  AgentWorkspaceEvent,
  BranchMessageInput,
  ContinueRunInput,
  EditMessageInput,
  ProviderModelPoolEntry,
  ProviderModelsResult,
  ProviderModelView,
  ProviderProfileView,
  ProviderReasoningEffort,
  ProviderSaveInput,
  ProviderStatusView,
  StartRunInput,
} from '../../contracts/ui.js'
import { AGENT_UI_PROTOCOL_VERSION } from '../../contracts/ui.js'
import type { AgentRunPlan, RuntimeToolDefinition, RuntimeToolResult } from '../../pi/types.js'
import { fetchOpenAiCompatibleModels } from '../../provider-openai-compatible/browser.js'
import { normalizeProviderBaseUrl } from '../../provider-openai-compatible/http.js'
import { createOpenAiCompatibleRuntimeSupport } from '../../provider-openai-compatible/runtime.js'
import { PROVIDER_SETTINGS_VERSION } from '../../provider-openai-compatible/types.js'
import { createExaWebSearchProvider } from '../../search/impl/exa-web-search-provider.js'
import { createWebSearchTool, WEB_SEARCH_TOOL_METADATA } from '../../search/impl/web-search-tool.js'
import {
  ASK_USER_TOOL_METADATA,
  type AskUserExecutionContext,
  type AskUserOutcome,
  type AskUserRequest,
  createAskUserTool,
} from '../../tools/ask-user-tool.js'
import {
  AGENT_HOST_PROTOCOL_VERSION,
  type AgentClientMessage,
  type AgentClientMethodName,
  type AgentClientParams,
  type AgentClientRequest,
  type AgentClientResult,
  type AgentHostMethodName,
  type AgentHostParams,
  type AgentHostRequest,
  type AgentHostResult,
  type AgentHostToolState,
  type ChartToolDescriptor,
} from '../protocol.js'
import type { AgentClientSender, AgentHostOptions, AgentRuntimeSessions } from '../types.js'
import {
  type AgentProviderProfile,
  AgentSettingsCredentialStore,
  type AgentSettingsDocument,
  AgentSettingsProviderStore,
  AgentSettingsStore,
} from './agent-settings.js'

/** 某次运行所用的页面能力来源：发起页与它声明的图表工具。 */
interface RunToolSource {
  readonly clientId: string
  readonly tools: readonly ChartToolDescriptor[]
}

/** 等待页面应答的调用。 */
interface PendingClientCall {
  readonly resolve: (result: unknown) => void
  readonly reject: (error: unknown) => void
  /** 中止时同时撤销页面上的待办。 */
  readonly detach: () => void
}

/** 宿主实现；所有页面能力只经协议调用，页面不直接触达内部状态。 */
export class AgentHost {
  private readonly settings: AgentSettingsStore
  private readonly createSessions: () => Promise<AgentRuntimeSessions>
  private readonly fetchImplementation: typeof globalThis.fetch
  private readonly createId: () => string
  private readonly clients = new Map<string, AgentClientSender>()
  private readonly pendingCalls = new Map<string, PendingClientCall>()
  private readonly runSources = new Map<string, RunToolSource>()
  /** 租约 → 会话；租约 → 持有它的页面；会话 → 全部租约。 */
  private readonly leaseSessions = new Map<string, string>()
  private readonly leaseClients = new Map<string, string>()
  private readonly sessionLeases = new Map<string, Set<string>>()
  private readonly credentials: AgentSettingsCredentialStore
  private readonly providerSettings: AgentSettingsProviderStore
  private readonly support
  private readonly handlers: {
    [K in AgentHostMethodName]: (
      clientId: string,
      params: AgentHostParams<K>,
    ) => Promise<AgentHostResult<K>>
  }
  private runtimePromise: Promise<AgentApplicationService> | undefined
  private durable: AgentRuntimeSessions | undefined
  /** 设置文档里的启用集合；`null` 表示全开。 */
  private enabledTools: readonly string[] | null | undefined
  /** 全局 Web Search 凭据；随设置文档一起载入。 */
  private webSearchApiKey: string | undefined

  constructor(options: AgentHostOptions) {
    this.settings = options.settings
    this.createSessions = options.createSessions
    this.fetchImplementation = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.createId = options.createId ?? (() => crypto.randomUUID())
    this.credentials = new AgentSettingsCredentialStore(this.settings)
    this.providerSettings = new AgentSettingsProviderStore(this.settings)
    this.support = createOpenAiCompatibleRuntimeSupport({
      credentials: this.credentials,
      settings: this.providerSettings,
      fetch: this.fetchImplementation,
      tools: (input) => this.resolveTools(input),
    })
    this.handlers = this.createHandlers()
  }

  /** 接入一个页面；同一 clientId 重连时替换出口。 */
  attachClient(clientId: string, send: AgentClientSender): void {
    this.clients.set(clientId, send)
  }

  /**
   * 断开一个页面。
   *
   * 该页面发起但尚未应答的调用全部失败，它持有的会话租约一并释放。
   */
  async detachClient(clientId: string): Promise<void> {
    this.clients.delete(clientId)
    for (const [id, pending] of this.pendingCalls) {
      this.pendingCalls.delete(id)
      pending.detach()
      pending.reject(
        new AgentRuntimeError('TARGET_LOST', 'The Agent client disconnected before replying.', {
          retryable: false,
        }),
      )
    }
    for (const [leaseId, owner] of [...this.leaseClients]) {
      if (owner === clientId) await this.dropLease(leaseId)
    }
    for (const [sessionId, source] of this.runSources) {
      if (source.clientId === clientId) this.runSources.delete(sessionId)
    }
  }

  /** 接收页面消息；应答、断开与请求分开处理。 */
  receive(clientId: string, message: AgentClientMessage): void {
    if (message.kind === 'detach') {
      void this.detachClient(clientId)
      return
    }
    if (message.kind === 'response') {
      const pending = this.pendingCalls.get(message.id)
      if (!pending) return
      this.pendingCalls.delete(message.id)
      pending.detach()
      if (message.ok) pending.resolve(message.result)
      else pending.reject(agentRuntimeErrorFromView(message.error))
      return
    }
    void this.dispatch(clientId, message)
  }

  /** 关闭宿主：结束运行、释放存储，不再接受新调用。 */
  async close(): Promise<void> {
    this.clients.clear()
    for (const [id, pending] of this.pendingCalls) {
      this.pendingCalls.delete(id)
      pending.detach()
      pending.reject(new AgentRuntimeError('ABORTED', 'The Agent host is closing.'))
    }
    const pending = this.runtimePromise
    this.runtimePromise = undefined
    if (pending) {
      const runtime = await pending.catch(() => undefined)
      await runtime?.close()
    }
    await this.durable?.close()
    this.durable = undefined
  }

  /** 分发一次页面请求；错误以应答形式回传，不中断宿主。 */
  private async dispatch(clientId: string, request: AgentHostRequest): Promise<void> {
    if (request.protocolVersion !== AGENT_HOST_PROTOCOL_VERSION) {
      this.respond(
        clientId,
        request.id,
        false,
        new AgentRuntimeError(
          'INVALID_PROTOCOL',
          `Agent host protocol ${request.protocolVersion} is not supported.`,
        ),
      )
      return
    }
    try {
      // 序列化边界：泛型方法名无法让编译器把 params 收窄到对应成员，
      // 处理表与协议方法一一对应，签名由协议类型约束。
      const handler = this.handlers[request.method] as unknown as (
        clientId: string,
        params: unknown,
      ) => Promise<unknown>
      const result = await handler(clientId, request.params)
      this.respond(clientId, request.id, true, result)
    } catch (error) {
      this.respond(clientId, request.id, false, toAgentRuntimeError(error))
    }
  }

  /** 单条应答；目标页面已断开时没有接收方，直接丢弃。 */
  private respond(clientId: string, id: string, ok: boolean, payload: unknown): void {
    const send = this.clients.get(clientId)
    if (!send) return
    if (ok) send({ kind: 'response', id, ok: true, result: payload })
    else
      send({
        kind: 'response',
        id,
        ok: false,
        error: toAgentRuntimeError(payload).toView(),
      })
  }

  /** 方法表：键与协议方法一一对应，签名由协议类型约束。 */
  private createHandlers(): {
    [K in AgentHostMethodName]: (
      clientId: string,
      params: AgentHostParams<K>,
    ) => Promise<AgentHostResult<K>>
  } {
    return {
      'sessions.list': async () => this.listSessions(),
      'sessions.open': async (clientId, params) => this.openSession(clientId, params.sessionId),
      'sessions.release': async (clientId, params) => {
        await this.releaseLease(clientId, params.leaseId)
        return undefined
      },
      'sessions.loadEarlier': async (_clientId, params) => this.loadEarlier(params.sessionId),
      'sessions.fillGap': async (_clientId, params) =>
        this.fillGap(params.sessionId, params.after, params.upTo),
      'sessions.create': async () => this.createSession(),
      'sessions.rename': async (_clientId, params) => {
        await this.renameSession(params.sessionId, params.title)
        return undefined
      },
      'sessions.delete': async (_clientId, params) => {
        await this.deleteSession(params.sessionId)
        return undefined
      },

      'runs.start': async (clientId, params) => this.startRun(clientId, params.input, params.tools),
      'runs.cancel': async (_clientId, params) => {
        await this.cancelRun(params.sessionId)
        return undefined
      },
      'runs.retry': async (clientId, params) => this.retryRun(clientId, params.input, params.tools),
      'runs.continue': async (clientId, params) =>
        this.continueRun(clientId, params.input, params.tools),
      'runs.edit': async (clientId, params) =>
        this.editMessage(clientId, params.input, params.tools),

      'provider.status': async () => this.getProviderStatus(),
      'provider.profiles': async () => this.listProviderProfiles(),
      'provider.profile.create': async (_clientId, params) => {
        await this.createProviderProfile(params.profileName)
        return undefined
      },
      'provider.profile.rename': async (_clientId, params) => {
        await this.renameProviderProfile(params.profileName, params.nextProfileName)
        return undefined
      },
      'provider.profile.delete': async (_clientId, params) => {
        await this.deleteProviderProfile(params.profileName)
        return undefined
      },
      'provider.profile.select': async (_clientId, params) => {
        await this.selectProviderProfile(params.profileName)
        return undefined
      },
      'provider.profile.save': async (_clientId, params) => {
        await this.saveProvider(params)
        return undefined
      },
      'provider.reasoningEffort': async (_clientId, params) => {
        await this.setProviderReasoningEffort(params.effort)
        return undefined
      },
      'provider.credential.delete': async () => {
        await this.deleteProviderCredential()
        return undefined
      },
      'provider.webSearchKey': async (_clientId, params) => {
        await this.saveWebSearchApiKey(params.apiKey)
        return undefined
      },
      'provider.modelCatalog': async () => this.listProviderModelCatalog(),
      'provider.modelPool': async () => this.listProviderModelPool(),
      'provider.modelPool.add': async (_clientId, params) =>
        this.addProviderModelPoolModel(params.model),
      'provider.modelPool.remove': async (_clientId, params) =>
        this.removeProviderModelPoolModel(params.modelId),
      'provider.model.select': async (_clientId, params) => {
        await this.setProviderModel(params.modelId)
        return undefined
      },

      'tools.list': async () => this.listHostTools(),
      'tools.setEnabled': async (_clientId, params) => {
        await this.setToolEnabled(params.name, params.enabled, params.knownNames)
        return undefined
      },
      'tools.debug': async (clientId, params) =>
        this.debugTool(clientId, params.name, params.input),

      'settings.importLegacy': async (_clientId, params) => {
        await this.settings.importLegacy(params.document)
        await this.refreshSettingsCache()
        return undefined
      },
    }
  }

  /** 会话目录。 */
  private async listSessions(): Promise<AgentSessionView[]> {
    return (await this.runtime()).listSessions()
  }

  /** 打开会话并签发一份观察租约。 */
  private async openSession(
    clientId: string,
    sessionId: string,
  ): Promise<{ transcript: AgentTranscriptView; leaseId: string }> {
    const transcript = await (await this.runtime()).openSession(sessionId)
    const leaseId = this.createId()
    this.leaseSessions.set(leaseId, sessionId)
    this.leaseClients.set(leaseId, clientId)
    const leases = this.sessionLeases.get(sessionId) ?? new Set<string>()
    leases.add(leaseId)
    this.sessionLeases.set(sessionId, leases)
    return { transcript, leaseId }
  }

  /** 释放一份租约；只允许持有它的页面释放。 */
  private async releaseLease(clientId: string, leaseId: string): Promise<void> {
    if (this.leaseClients.get(leaseId) !== clientId)
      throw new AgentRuntimeError(
        'TARGET_LOST',
        'The Agent session lease is not held by this client.',
      )
    await this.dropLease(leaseId)
  }

  /**
   * 丢弃一份租约记账。
   *
   * 同一会话的最后一个租约离开时才关闭订阅，否则其它观察者会失去实时更新。
   */
  private async dropLease(leaseId: string): Promise<void> {
    const sessionId = this.leaseSessions.get(leaseId)
    if (sessionId === undefined) return
    this.leaseSessions.delete(leaseId)
    this.leaseClients.delete(leaseId)
    const leases = this.sessionLeases.get(sessionId)
    leases?.delete(leaseId)
    if (leases && leases.size > 0) return
    this.sessionLeases.delete(sessionId)
    await (await this.runtime()).closeSession(sessionId)
  }

  /** 加载更早一页。 */
  private async loadEarlier(sessionId: string): Promise<AgentTranscriptView> {
    return (await this.runtime()).loadEarlier(sessionId)
  }

  /** 补齐条目流缺口。 */
  private async fillGap(
    sessionId: string,
    after: EntryId,
    upTo: EntryId,
  ): Promise<AgentTranscriptView> {
    return (await this.runtime()).fillGap(sessionId, after, upTo)
  }

  /** 新建会话。 */
  private async createSession(): Promise<AgentSessionView> {
    return (await this.runtime()).createSession()
  }

  /** 重命名会话。 */
  private async renameSession(sessionId: string, title: string): Promise<void> {
    await (await this.runtime()).renameSession(sessionId, title)
  }

  /** 删除会话；宿主随删除一并丢弃该会话的全部租约。 */
  private async deleteSession(sessionId: string): Promise<void> {
    await (await this.runtime()).deleteSession(sessionId)
    const leases = this.sessionLeases.get(sessionId)
    if (!leases) return
    for (const leaseId of [...leases]) {
      this.leaseSessions.delete(leaseId)
      this.leaseClients.delete(leaseId)
    }
    this.sessionLeases.delete(sessionId)
  }

  /** 发起运行；工具描述随运行登记，供计划构建时解析。 */
  private async startRun(
    clientId: string,
    input: StartRunInput,
    tools: readonly ChartToolDescriptor[],
  ): Promise<{ runId: string; sessionId: string }> {
    this.registerRunSource(input.sessionId, clientId, tools)
    return (await this.runtime()).startRun(input)
  }

  /** 中止运行。 */
  private async cancelRun(sessionId: string): Promise<void> {
    await (await this.runtime()).cancelRun(sessionId)
  }

  /** 重新生成。 */
  private async retryRun(
    clientId: string,
    input: BranchMessageInput,
    tools: readonly ChartToolDescriptor[],
  ): Promise<{ runId: string; sessionId: string }> {
    this.registerRunSource(input.sessionId, clientId, tools)
    return (await this.runtime()).retryRun(input)
  }

  /** 继续运行。 */
  private async continueRun(
    clientId: string,
    input: ContinueRunInput,
    tools: readonly ChartToolDescriptor[],
  ): Promise<{ runId: string; sessionId: string }> {
    this.registerRunSource(input.sessionId, clientId, tools)
    return (await this.runtime()).continueRun(input)
  }

  /** 编辑重发。 */
  private async editMessage(
    clientId: string,
    input: EditMessageInput,
    tools: readonly ChartToolDescriptor[],
  ): Promise<{ runId: string; sessionId: string }> {
    this.registerRunSource(input.sessionId, clientId, tools)
    return (await this.runtime()).editMessage(input)
  }

  /** 登记某会话当前由哪个页面发起、声明了哪些图表工具。 */
  private registerRunSource(
    sessionId: string,
    clientId: string,
    tools: readonly ChartToolDescriptor[],
  ): void {
    if (!this.clients.has(clientId))
      throw new AgentRuntimeError('TARGET_LOST', 'The Agent client is not attached to the host.')
    this.runSources.set(sessionId, { clientId, tools })
  }

  /** Provider 状态；补充 profile 名称与外部搜索凭据状态。 */
  private async getProviderStatus(): Promise<ProviderStatusView> {
    const status = await this.support.provider.getStatus()
    const document = await this.settings.read()
    const profile = document.profiles.find((item) => item.active)
    const exaConfigured = Boolean(document.exaApiKey?.trim())
    if (!profile) return { ...status, exaConfigured }
    if (!profile.connection) return { ...status, profileName: profile.name, exaConfigured }
    if (profile.settings) return { ...status, profileName: profile.name, exaConfigured }
    return {
      state: 'not-configured',
      providerLabel: 'OpenAI-compatible',
      configured: true,
      baseUrl: profile.connection.baseUrl,
      headers: profile.connection.headers,
      protocol: profile.connection.protocol,
      profileName: profile.name,
      exaConfigured,
    }
  }

  /** 广播最新 Provider 状态，供设置面板与状态栏同步。 */
  private async emitProviderStatus(): Promise<void> {
    this.broadcast({
      type: 'provider.status.changed',
      protocolVersion: AGENT_UI_PROTOCOL_VERSION,
      status: await this.getProviderStatus(),
    })
  }

  /** 已保存配置的视图；API Key 不出宿主。 */
  private async listProviderProfiles(): Promise<ProviderProfileView[]> {
    const document = await this.settings.read()
    return document.profiles.map((profile) => ({
      name: profile.name,
      baseUrl: profile.connection?.baseUrl ?? '',
      modelId: profile.settings?.modelId ?? '',
      modelName: profile.settings?.modelName ?? '',
      protocol: profile.connection?.protocol ?? 'openai-responses',
      ...(profile.settings?.contextWindow === undefined
        ? {}
        : { contextWindow: profile.settings.contextWindow }),
      ...(profile.settings?.maxOutputTokens === undefined
        ? {}
        : { maxOutputTokens: profile.settings.maxOutputTokens }),
      ...(profile.settings?.reasoningEfforts === undefined
        ? {}
        : { reasoningEfforts: profile.settings.reasoningEfforts }),
      ...(profile.settings?.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: profile.settings.reasoningEffort }),
    }))
  }

  /** 新配置成为唯一激活项。 */
  private async createProviderProfile(profileName: string): Promise<void> {
    const document = await this.settings.read()
    if (document.profiles.some((profile) => profile.name === profileName))
      throw new AgentRuntimeError(
        'PROVIDER_ERROR',
        'The Provider configuration name is already in use.',
      )
    await this.commitSettings({
      ...document,
      profiles: [
        ...document.profiles.map((profile) => ({ ...profile, active: false })),
        { name: profileName, apiKey: '', active: true },
      ],
    })
    await this.emitProviderStatus()
  }

  /** 重命名配置并同步模型池分组。 */
  private async renameProviderProfile(profileName: string, nextProfileName: string): Promise<void> {
    const nextName = nextProfileName.trim()
    if (!profileName || !nextName)
      throw new AgentRuntimeError('PROVIDER_ERROR', 'The Provider configuration name is required.')
    const document = await this.settings.read()
    if (!document.profiles.some((profile) => profile.name === profileName))
      throw new AgentRuntimeError('PROVIDER_ERROR', 'The Provider configuration was not found.')
    if (nextName === profileName) return
    if (document.profiles.some((profile) => profile.name === nextName))
      throw new AgentRuntimeError(
        'PROVIDER_ERROR',
        'The Provider configuration name is already in use.',
      )
    await this.commitSettings({
      ...document,
      profiles: document.profiles.map((profile) =>
        profile.name === profileName ? { ...profile, name: nextName } : profile,
      ),
      modelPool: document.modelPool.map((model) =>
        model.provider === profileName ? { ...model, provider: nextName } : model,
      ),
    })
    await this.emitProviderStatus()
  }

  /** 删除配置及其模型池。 */
  private async deleteProviderProfile(profileName: string): Promise<void> {
    const document = await this.settings.read()
    if (!document.profiles.some((profile) => profile.name === profileName))
      throw new AgentRuntimeError('PROVIDER_ERROR', 'The Provider configuration was not found.')
    await this.commitSettings({
      ...document,
      profiles: document.profiles.filter((profile) => profile.name !== profileName),
      modelPool: document.modelPool.filter((model) => model.provider !== profileName),
    })
    await this.emitProviderStatus()
  }

  /** 切换激活配置。 */
  private async selectProviderProfile(profileName: string): Promise<void> {
    const document = await this.settings.read()
    if (!document.profiles.some((profile) => profile.name === profileName))
      throw new AgentRuntimeError('PROVIDER_ERROR', 'The Provider configuration was not found.')
    await this.commitSettings({
      ...document,
      profiles: document.profiles.map((profile) => ({
        ...profile,
        active: profile.name === profileName,
      })),
    })
    await this.emitProviderStatus()
  }

  /** 保存连接与凭据；连接变化时废弃模型选择与模型池。 */
  private async saveProvider(input: ProviderSaveInput): Promise<void> {
    const profileName = input.profileName.trim()
    if (!profileName)
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'Enter a configuration name before saving.',
      )
    const baseUrl = normalizeProviderBaseUrl(input.baseUrl)
    const document = await this.settings.read()
    const existing = document.profiles.find((profile) => profile.name === profileName)
    const connection = {
      baseUrl,
      headers: input.headers ?? {},
      protocol: input.protocol,
    }
    const previousConnection = existing?.connection
    const connectionChanged =
      previousConnection !== undefined &&
      (previousConnection.baseUrl !== connection.baseUrl ||
        previousConnection.protocol !== connection.protocol)
    const pool = document.modelPool.filter((model) => model.provider === profileName)
    const keepsSettings =
      !connectionChanged &&
      existing?.settings !== undefined &&
      pool.some((model) => model.id === existing.settings?.modelId)
    const apiKey = input.apiKey?.trim() || existing?.apiKey || ''
    const profile: AgentProviderProfile = {
      name: profileName,
      apiKey,
      connection,
      active: true,
      ...(keepsSettings && existing?.settings ? { settings: existing.settings } : {}),
    }
    await this.commitSettings({
      ...document,
      profiles: (existing
        ? document.profiles.map((item) => (item.name === profileName ? profile : item))
        : [...document.profiles, profile]
      ).map((item) => ({ ...item, active: item.name === profileName })),
      modelPool: connectionChanged
        ? document.modelPool.filter((model) => model.provider !== profileName)
        : document.modelPool,
    })
    await this.emitProviderStatus()
  }

  /** 选择模型并把模型能力写回配置。 */
  private async setProviderModel(modelId: string): Promise<void> {
    const document = await this.settings.read()
    const profile = document.profiles.find((item) => item.active)
    if (!profile?.connection)
      throw new AgentRuntimeError('PROVIDER_NOT_CONFIGURED', 'The Provider connection is missing.')
    const model = document.modelPool.find(
      (item) => item.provider === profile.name && item.id === modelId,
    )
    if (!model)
      throw new AgentRuntimeError('PROVIDER_ERROR', 'The model is not in this Provider model pool.')
    const settings = {
      version: PROVIDER_SETTINGS_VERSION,
      ...profile.connection,
      modelId: model.id,
      modelName: model.name,
      maxOutputTokens: model.maxOutputTokens ?? 16_384,
      reasoningEfforts: model.reasoningEfforts ?? [],
      ...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
      ...(model.defaultReasoningEffort === undefined
        ? {}
        : { reasoningEffort: model.defaultReasoningEffort }),
    }
    await this.commitSettings({
      ...document,
      profiles: document.profiles.map((item) =>
        item.name === profile.name ? { ...item, settings } : item,
      ),
    })
    await this.emitProviderStatus()
  }

  /** 更新思考强度；模型未声明该档位时明确报错。 */
  private async setProviderReasoningEffort(
    effort: ProviderReasoningEffort | undefined,
  ): Promise<void> {
    const document = await this.settings.read()
    const profile = document.profiles.find((item) => item.active)
    if (!profile?.settings)
      throw new AgentRuntimeError('PROVIDER_ERROR', 'The Provider model is not configured.')
    if (effort !== undefined && !profile.settings.reasoningEfforts.includes(effort))
      throw new AgentRuntimeError(
        'PROVIDER_ERROR',
        'The selected model does not support this reasoning effort.',
      )
    const settings = profile.settings
    await this.commitSettings({
      ...document,
      profiles: document.profiles.map((item) =>
        item.name === profile.name
          ? { ...item, settings: { ...settings, reasoningEffort: effort } }
          : item,
      ),
    })
    await this.emitProviderStatus()
  }

  /** 删除当前激活配置的凭据。 */
  private async deleteProviderCredential(): Promise<void> {
    await this.support.provider.deleteCredential()
    await this.emitProviderStatus()
  }

  /** 保存全局 Web Search 凭据。 */
  private async saveWebSearchApiKey(apiKey: string): Promise<void> {
    const document = await this.settings.read()
    const trimmed = apiKey.trim()
    const next: AgentSettingsDocument = {
      ...document,
      ...(trimmed ? { exaApiKey: trimmed } : { exaApiKey: undefined }),
    }
    await this.commitSettings(next)
    this.webSearchApiKey = trimmed || undefined
    await this.emitProviderStatus()
  }

  /** 拉取远端模型目录。 */
  private async listProviderModelCatalog(): Promise<ProviderModelsResult> {
    const document = await this.settings.read()
    const profile = document.profiles.find((item) => item.active)
    if (!profile?.connection)
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'The active Provider has no saved connection.',
      )
    return fetchOpenAiCompatibleModels({
      ...profile.connection,
      apiKey: await this.credentials.read(),
    })
  }

  /** 当前配置的模型池。 */
  private async listProviderModelPool(): Promise<ProviderModelPoolEntry[]> {
    const document = await this.settings.read()
    const profile = document.profiles.find((item) => item.active)
    if (!profile) return []
    return document.modelPool.filter((model) => model.provider === profile.name)
  }

  /** 加入一个模型并返回新的模型池。 */
  private async addProviderModelPoolModel(
    model: ProviderModelView,
  ): Promise<ProviderModelPoolEntry[]> {
    const document = await this.settings.read()
    const profile = document.profiles.find((item) => item.active)
    if (!profile)
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'Select a Provider configuration before adding a model.',
      )
    const entry: ProviderModelPoolEntry = { ...model, provider: profile.name }
    const next = document.modelPool.some(
      (item) => item.provider === profile.name && item.id === model.id,
    )
      ? document.modelPool.map((item) =>
          item.provider === profile.name && item.id === model.id ? entry : item,
        )
      : [...document.modelPool, entry]
    await this.commitSettings({ ...document, modelPool: next })
    return next.filter((item) => item.provider === profile.name)
  }

  /** 移除一个模型；若正是当前选择则清空模型设置。 */
  private async removeProviderModelPoolModel(modelId: string): Promise<ProviderModelPoolEntry[]> {
    const document = await this.settings.read()
    const profile = document.profiles.find((item) => item.active)
    if (!profile)
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'Select a Provider configuration before removing a model.',
      )
    const dropsSelection = profile.settings?.modelId === modelId
    const nextPool = document.modelPool.filter(
      (item) => !(item.provider === profile.name && item.id === modelId),
    )
    await this.commitSettings({
      ...document,
      modelPool: nextPool,
      profiles: dropsSelection
        ? document.profiles.map((item) =>
            item.name === profile.name
              ? {
                  name: item.name,
                  apiKey: item.apiKey,
                  active: item.active,
                  ...(item.connection === undefined ? {} : { connection: item.connection }),
                }
              : item,
          )
        : document.profiles,
    })
    await this.emitProviderStatus()
    return nextPool.filter((item) => item.provider === profile.name)
  }

  /** 宿主侧工具状态；页面再与本地图表工具合并。 */
  private async listHostTools(): Promise<AgentHostToolState> {
    const document = await this.settings.read()
    const enabled = document.enabledTools
    this.enabledTools = enabled
    const isEnabled = (name: string): boolean => enabled === null || enabled.includes(name)
    const hostTools: AgentToolView[] = [
      {
        name: WEB_SEARCH_TOOL_METADATA.name,
        label: WEB_SEARCH_TOOL_METADATA.label,
        description: WEB_SEARCH_TOOL_METADATA.description,
        enabled: isEnabled(WEB_SEARCH_TOOL_METADATA.name),
      },
      {
        name: ASK_USER_TOOL_METADATA.name,
        label: ASK_USER_TOOL_METADATA.label,
        description: ASK_USER_TOOL_METADATA.description,
        enabled: isEnabled(ASK_USER_TOOL_METADATA.name),
      },
    ]
    return { hostTools, enabledTools: enabled }
  }

  /** 持久化工具启用状态；首次写入以页面提供的完整清单为基准。 */
  private async setToolEnabled(
    name: string,
    enabled: boolean,
    knownNames: readonly string[],
  ): Promise<void> {
    const document = await this.settings.read()
    const current = new Set(document.enabledTools ?? knownNames)
    if (enabled) current.add(name)
    else current.delete(name)
    await this.commitSettings({ ...document, enabledTools: [...current] })
  }

  /** 手动执行宿主侧工具；图表工具由页面自己执行。 */
  private async debugTool(
    clientId: string,
    name: string,
    input: unknown,
  ): Promise<AgentToolDebugResult> {
    const tool = this.hostToolDefinitions(clientId).find((item) => item.name === name)
    if (!tool)
      throw new AgentRuntimeError('TOOL_NOT_ALLOWED', `Agent tool '${name}' is not a host tool.`)
    const result = await tool.execute(input, {
      sessionId: 'debug',
      runId: `debug:${this.createId()}`,
      toolCallId: `debug:${this.createId()}`,
      signal: new AbortController().signal,
      progress: () => undefined,
    })
    return { content: result.content, summary: result.summary }
  }

  /** 写入设置文档并同步缓存。 */
  private async commitSettings(document: AgentSettingsDocument): Promise<void> {
    await this.settings.replace(document)
    this.enabledTools = document.enabledTools
    this.webSearchApiKey = document.exaApiKey?.trim() || undefined
  }

  /** 载入设置文档并刷新宿主缓存。 */
  private async refreshSettingsCache(): Promise<void> {
    const document = await this.settings.read()
    this.enabledTools = document.enabledTools
    this.webSearchApiKey = document.exaApiKey?.trim() || undefined
  }

  /** 组装一次运行的完整工具表：图表工具按发起页登记，宿主工具常驻。 */
  private resolveTools(input: RunPlanInput): readonly RuntimeToolDefinition[] {
    const source = this.runSources.get(input.sessionId)
    if (!source)
      throw new AgentRuntimeError(
        'TARGET_LOST',
        `No Agent client declared tools for session ${input.sessionId}.`,
      )
    if (this.enabledTools === undefined)
      throw new AgentRuntimeError(
        'INTERNAL_ERROR',
        'Agent settings were not loaded before planning.',
      )
    const enabled = this.enabledTools
    const isEnabled = (name: string): boolean => enabled === null || enabled.includes(name)
    const tools: RuntimeToolDefinition[] = []
    for (const descriptor of source.tools) {
      if (!isEnabled(descriptor.name)) continue
      tools.push(this.chartToolDefinition(source.clientId, descriptor))
    }
    for (const tool of this.hostToolDefinitions(source.clientId)) {
      if (isEnabled(tool.name)) tools.push(tool)
    }
    return tools.filter((tool) => input.mode === 'build' || tool.effect === 'read')
  }

  /** 把页面声明的图表工具包装成宿主可执行的定义；执行经协议回路由。 */
  private chartToolDefinition(
    clientId: string,
    descriptor: ChartToolDescriptor,
  ): RuntimeToolDefinition {
    return {
      name: descriptor.name,
      label: descriptor.label,
      description: descriptor.description,
      parameters: descriptor.parameters,
      effect: descriptor.effect,
      executionMode: descriptor.effect === 'read' ? 'parallel' : 'sequential',
      execute: async (input, context): Promise<RuntimeToolResult> => {
        context.signal.throwIfAborted()
        return this.callClient(
          clientId,
          'tools.execute',
          {
            toolName: descriptor.name,
            input,
            sessionId: context.sessionId,
            runId: context.runId,
            toolCallId: context.toolCallId,
          },
          context.signal,
        )
      },
    }
  }

  /** 宿主原生工具：Web 搜索与提问。 */
  private hostToolDefinitions(clientId: string): readonly RuntimeToolDefinition[] {
    return [
      createWebSearchTool(
        createExaWebSearchProvider({
          ...(this.webSearchApiKey === undefined ? {} : { apiKey: this.webSearchApiKey }),
          fetch: this.fetchImplementation,
        }),
      ),
      createAskUserTool({
        request: (request, context) => this.askClient(clientId, request, context),
      }),
    ]
  }

  /** 把提问送回发起页并等待答复；运行中止时撤销页面上的提问。 */
  private async askClient(
    clientId: string,
    request: AskUserRequest,
    context: AskUserExecutionContext,
  ): Promise<AskUserOutcome> {
    const questionId = this.createId()
    try {
      return await this.callClient(
        clientId,
        'questions.ask',
        {
          questionId,
          sessionId: context.sessionId,
          toolCallId: context.toolCallId,
          prompt: request.prompt,
          options: request.options,
          multiSelect: request.multiSelect,
        },
        context.signal,
      )
    } catch (error) {
      this.clients.get(clientId)?.({
        kind: 'question.dismiss',
        protocolVersion: AGENT_HOST_PROTOCOL_VERSION,
        questionId,
      })
      if (context.signal.aborted) return { status: 'cancelled' }
      throw error
    }
  }

  /**
   * 向页面发起一次调用并等待应答。
   *
   * @param clientId 目标页面；未接入时立即失败。
   * @param method 页面方法名。
   * @param params 与页面方法一一对应的参数。
   * @param signal 结束等待的信号。
   */
  private callClient<K extends AgentClientMethodName>(
    clientId: string,
    method: K,
    params: AgentClientParams<K>,
    signal?: AbortSignal,
  ): Promise<AgentClientResult<K>> {
    const send = this.clients.get(clientId)
    if (!send)
      throw new AgentRuntimeError('TARGET_LOST', 'The Agent client that started this run is gone.')
    const id = this.createId()
    return new Promise<AgentClientResult<K>>((resolve, reject) => {
      const onAbort = (): void => {
        if (!this.pendingCalls.delete(id)) return
        send({
          kind: 'call.cancel',
          protocolVersion: AGENT_HOST_PROTOCOL_VERSION,
          requestId: id,
        })
        reject(new AgentRuntimeError('ABORTED', 'The Agent call was aborted.'))
      }
      const detach = (): void => signal?.removeEventListener('abort', onAbort)
      // 序列化边界：应答体由同一份代码在另一端构造，按声明的结果类型消费。
      this.pendingCalls.set(id, {
        resolve: (value) => resolve(value as AgentClientResult<K>),
        reject,
        detach,
      })
      signal?.addEventListener('abort', onAbort, { once: true })
      // 序列化边界：泛型方法名无法让编译器把 params 收窄到对应成员。
      send({
        kind: 'request',
        protocolVersion: AGENT_HOST_PROTOCOL_VERSION,
        id,
        method,
        params,
      } as AgentClientRequest)
    })
  }

  /** 惰性创建运行时；失败不缓存，下一次调用可以重试。 */
  private runtime(): Promise<AgentApplicationService> {
    this.runtimePromise ??= this.initializeRuntime().catch((error: unknown) => {
      this.runtimePromise = undefined
      throw toAgentRuntimeError(error)
    })
    return this.runtimePromise
  }

  /** 打开存储、载入设置并装配应用服务。 */
  private async initializeRuntime(): Promise<AgentApplicationService> {
    const durable = await this.createSessions()
    try {
      await this.refreshSettingsCache()
      const runtime = new AgentApplicationService({
        sessions: durable.sessions,
        createPlan: (input) => this.createPlan(input),
        provider: this.support.provider,
      })
      runtime.subscribe((event) => this.broadcast(event))
      if (!(await runtime.listSessions()).length) await runtime.createSession()
      this.durable = durable
      return runtime
    } catch (error) {
      await durable.close()
      throw error
    }
  }

  /** 计划构建入口；把支持层的异常统一收敛为运行时错误。 */
  private async createPlan(input: RunPlanInput): Promise<AgentRunPlan> {
    return this.support.createPlan(input)
  }

  /** 把工作区事件广播给所有已接入页面。 */
  private broadcast(event: AgentWorkspaceEvent): void {
    const notification = {
      kind: 'event' as const,
      protocolVersion: AGENT_HOST_PROTOCOL_VERSION,
      event: { ...event, protocolVersion: AGENT_UI_PROTOCOL_VERSION },
    }
    this.clients.forEach((send) => send(notification))
  }
}
