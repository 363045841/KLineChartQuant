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
  ProviderCatalogView,
  ProviderConnectionInput,
  ProviderModelView,
  ProviderReasoningEffort,
  ProviderSnapshot,
} from '../../contracts/provider.js'
import type {
  AgentSessionView,
  AgentToolDebugResult,
  AgentToolView,
  AgentTranscriptView,
  AgentWorkspaceEvent,
  BranchMessageInput,
  ContinueRunInput,
  EditMessageInput,
  StartRunInput,
} from '../../contracts/ui.js'
import { AGENT_UI_PROTOCOL_VERSION } from '../../contracts/ui.js'
import type { AgentRunPlan, RuntimeToolDefinition, RuntimeToolResult } from '../../pi/types.js'
import { normalizeProviderBaseUrl } from '../../provider-openai-compatible/http.js'
import type { OpenAiCompatibleRuntimeSupport } from '../../provider-openai-compatible/runtime.js'
import { createOpenAiCompatibleRuntimeSupport } from '../../provider-openai-compatible/runtime.js'
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
  type AgentSettingsDocument,
  AgentSettingsStore,
  activeProfile,
  normalizeProfileName,
  normalizeProviderHeaders,
  normalizeProviderModel,
  normalizeProviderProtocol,
  projectProviderSettings,
  projectProviderSnapshot,
  requireProfile,
} from './agent-settings.js'
import { withModeGate } from './mode-gate.js'

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
  private readonly credentials: {
    read(signal?: AbortSignal): Promise<string | undefined>
  }
  private readonly support: OpenAiCompatibleRuntimeSupport
  private readonly handlers: {
    [K in AgentHostMethodName]: (
      clientId: string,
      params: AgentHostParams<K>,
    ) => Promise<AgentHostResult<K>>
  }
  private runtimePromise: Promise<AgentApplicationService> | undefined
  private durable: AgentRuntimeSessions | undefined

  constructor(options: AgentHostOptions) {
    this.settings = options.settings
    this.createSessions = options.createSessions
    this.fetchImplementation = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.createId = options.createId ?? (() => crypto.randomUUID())
    // 凭据只读；写入与清除都经连接命令落在同一份设置文档上。
    this.credentials = {
      read: async () => activeProfile(await this.settings.read())?.apiKey || undefined,
    }
    this.support = createOpenAiCompatibleRuntimeSupport({
      credentials: this.credentials,
      settings: { read: async () => projectProviderSettings(await this.settings.read()) },
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

      'provider.snapshot': async () => this.providerSnapshot(),
      'provider.profile.create': async (_clientId, params) =>
        this.createProviderProfile(params.name),
      'provider.profile.rename': async (_clientId, params) =>
        this.renameProviderProfile(params.profileId, params.name),
      'provider.profile.delete': async (_clientId, params) =>
        this.deleteProviderProfile(params.profileId),
      'provider.profile.select': async (_clientId, params) =>
        this.selectProviderProfile(params.profileId),
      'provider.connection.save': async (_clientId, params) => this.saveProvider(params),
      'provider.catalog': async (_clientId, params) => this.readProviderCatalog(params.profileId),
      'provider.model.add': async (_clientId, params) =>
        this.addProviderModel(params.profileId, params.model),
      'provider.model.remove': async (_clientId, params) =>
        this.removeProviderModel(params.profileId, params.modelId),
      'provider.model.select': async (_clientId, params) =>
        this.selectProviderModel(params.profileId, params.modelId),
      'provider.reasoningEffort': async (_clientId, params) =>
        this.setProviderReasoningEffort(params.profileId, params.effort),
      'provider.exaKey': async (_clientId, params) => this.saveExaApiKey(params.apiKey),

      'tools.list': async () => this.listHostTools(),
      'tools.setEnabled': async (_clientId, params) => {
        await this.setToolEnabled(params.name, params.enabled)
        return undefined
      },
      'tools.debug': async (clientId, params) =>
        this.debugTool(clientId, params.name, params.input),

      'settings.importLegacy': async (_clientId, params) => {
        await this.settings.importLegacy(params.document)
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

  /** 当前 Provider 快照；页面渲染的唯一读入口。 */
  private async providerSnapshot(): Promise<ProviderSnapshot> {
    return projectProviderSnapshot(await this.settings.read())
  }

  /** 提交一次 Provider 文档变更并返回新快照。 */
  private async updateProvider(
    change: (document: AgentSettingsDocument) => void,
  ): Promise<ProviderSnapshot> {
    return projectProviderSnapshot(await this.settings.update(change))
  }

  /** 新建配置并设为激活项。 */
  private async createProviderProfile(name: string): Promise<ProviderSnapshot> {
    const profileName = normalizeProfileName(name)
    return this.updateProvider((document) => {
      requireUniqueProfileName(document, profileName)
      document.profiles = [
        ...document.profiles.map((profile) => ({ ...profile, active: false })),
        {
          id: `pf_${this.createId()}`,
          name: profileName,
          apiKey: '',
          active: true,
          connectionRevision: 0,
          models: [],
        },
      ]
    })
  }

  /** 重命名配置；模型池随配置存储，不需要级联改写。 */
  private async renameProviderProfile(profileId: string, name: string): Promise<ProviderSnapshot> {
    const nextName = normalizeProfileName(name)
    return this.updateProvider((document) => {
      const profile = requireProfile(document, profileId)
      if (nextName !== profile.name) requireUniqueProfileName(document, nextName, profile.id)
      profile.name = nextName
    })
  }

  /** 删除配置及其凭据与模型池。 */
  private async deleteProviderProfile(profileId: string): Promise<ProviderSnapshot> {
    return this.updateProvider((document) => {
      requireProfile(document, profileId)
      document.profiles = document.profiles.filter((profile) => profile.id !== profileId)
      // 删掉的是激活项时，第一个剩余配置接任；没有剩余配置就保持未激活。
      if (!document.profiles.some((profile) => profile.active))
        document.profiles = document.profiles.map((profile, index) => ({
          ...profile,
          active: index === 0,
        }))
    })
  }

  /** 切换激活配置。 */
  private async selectProviderProfile(profileId: string): Promise<ProviderSnapshot> {
    return this.updateProvider((document) => {
      requireProfile(document, profileId)
      document.profiles = document.profiles.map((profile) => ({
        ...profile,
        active: profile.id === profileId,
      }))
    })
  }

  /** 保存连接；连接变化时递增连接版本，模型池保持不动。 */
  private async saveProvider(input: ProviderConnectionInput): Promise<ProviderSnapshot> {
    const baseUrl = normalizeProviderBaseUrl(input.baseUrl)
    const headers = normalizeProviderHeaders(input.headers)
    const protocol = normalizeProviderProtocol(input.protocol)
    const apiKey = input.apiKey?.trim()
    return this.updateProvider((document) => {
      const profile = requireProfile(document, input.profileId)
      const changed =
        profile.connection === undefined ||
        profile.connection.baseUrl !== baseUrl ||
        profile.connection.protocol !== protocol ||
        !sameProviderHeaders(profile.connection.headers, headers)
      profile.connection = { baseUrl, headers, protocol }
      if (changed) profile.connectionRevision += 1
      if (apiKey) profile.apiKey = apiKey
    })
  }

  /** 读取远端模型目录；不落盘、不缓存，每次调用都现取。 */
  private async readProviderCatalog(profileId: string): Promise<ProviderCatalogView> {
    const document = await this.settings.read()
    const profile = requireProfile(document, profileId)
    if (!profile.connection)
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'Save the Provider connection before reading the model catalog.',
      )
    const result = await this.support.catalog.listModels({
      baseUrl: profile.connection.baseUrl,
      ...(profile.apiKey ? { apiKey: profile.apiKey } : {}),
    })
    return {
      profileId: profile.id,
      connectionRevision: profile.connectionRevision,
      models: result.models,
    }
  }

  /** 把一个模型加入模型池；元数据由宿主校验后固化。 */
  private async addProviderModel(
    profileId: string,
    model: ProviderModelView,
  ): Promise<ProviderSnapshot> {
    const entry = normalizeProviderModel(model)
    return this.updateProvider((document) => {
      const profile = requireProfile(document, profileId)
      const existing = profile.models.findIndex((item) => item.id === entry.id)
      if (existing >= 0) profile.models[existing] = entry
      else profile.models.push(entry)
    })
  }

  /** 从模型池移除；若是当前选中项则一并清空选择。 */
  private async removeProviderModel(profileId: string, modelId: string): Promise<ProviderSnapshot> {
    return this.updateProvider((document) => {
      const profile = requireProfile(document, profileId)
      profile.models = profile.models.filter((item) => item.id !== modelId)
      if (profile.selectedModelId === modelId) {
        delete profile.selectedModelId
        delete profile.reasoningEffort
      }
    })
  }

  /** 选择模型；思考强度回到该模型声明的默认档位。 */
  private async selectProviderModel(profileId: string, modelId: string): Promise<ProviderSnapshot> {
    return this.updateProvider((document) => {
      const profile = requireProfile(document, profileId)
      const model = profile.models.find((item) => item.id === modelId)
      if (!model)
        throw new AgentRuntimeError(
          'PROVIDER_MODEL_NOT_FOUND',
          'The model is not in this Provider model pool.',
        )
      profile.selectedModelId = model.id
      if (model.defaultReasoningEffort === undefined) delete profile.reasoningEffort
      else profile.reasoningEffort = model.defaultReasoningEffort
    })
  }

  /** 更新思考强度；模型未声明该档位时明确报错。 */
  private async setProviderReasoningEffort(
    profileId: string,
    effort: ProviderReasoningEffort | undefined,
  ): Promise<ProviderSnapshot> {
    return this.updateProvider((document) => {
      const profile = requireProfile(document, profileId)
      const model = profile.models.find((item) => item.id === profile.selectedModelId)
      if (!model)
        throw new AgentRuntimeError(
          'PROVIDER_MODEL_NOT_FOUND',
          'Select a model before choosing a reasoning effort.',
        )
      if (effort !== undefined && !model.reasoningEfforts.includes(effort))
        throw new AgentRuntimeError(
          'INVALID_PAYLOAD',
          'The selected model does not support this reasoning effort.',
        )
      if (effort === undefined) delete profile.reasoningEffort
      else profile.reasoningEffort = effort
    })
  }

  /** 保存全局 Web Search 凭据；空值表示清除。 */
  private async saveExaApiKey(apiKey: string): Promise<ProviderSnapshot> {
    const trimmed = apiKey.trim()
    return this.updateProvider((document) => {
      if (trimmed) document.exaApiKey = trimmed
      else delete document.exaApiKey
    })
  }

  /** 宿主侧工具状态；页面再与本地图表工具合并。 */
  private async listHostTools(): Promise<AgentHostToolState> {
    const document = await this.settings.read()
    const disabled = document.disabledTools
    const isEnabled = (name: string): boolean => !disabled.includes(name)
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
    return { hostTools, disabledTools: disabled }
  }

  /** 持久化工具禁用状态；启用即从禁用集合移除，禁用即加入。 */
  private async setToolEnabled(name: string, enabled: boolean): Promise<void> {
    await this.settings.update((document) => {
      const disabled = new Set(document.disabledTools)
      if (enabled) disabled.delete(name)
      else disabled.add(name)
      document.disabledTools = [...disabled]
    })
  }

  /** 手动执行宿主侧工具；图表工具由页面自己执行。 */
  private async debugTool(
    clientId: string,
    name: string,
    input: unknown,
  ): Promise<AgentToolDebugResult> {
    const document = await this.settings.read()
    const tool = this.hostToolDefinitions(clientId, document.exaApiKey?.trim()).find(
      (item) => item.name === name,
    )
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

  /** 组装一次运行的完整工具表：模式只包执行期 gate，不裁剪工具。 */
  private async resolveTools(input: RunPlanInput): Promise<readonly RuntimeToolDefinition[]> {
    const source = this.runSources.get(input.sessionId)
    if (!source)
      throw new AgentRuntimeError(
        'TARGET_LOST',
        `No Agent client declared tools for session ${input.sessionId}.`,
      )
    const document = await this.settings.read()
    const disabled = document.disabledTools
    const isEnabled = (name: string): boolean => !disabled.includes(name)
    const tools: RuntimeToolDefinition[] = []
    for (const descriptor of source.tools) {
      if (!isEnabled(descriptor.name)) continue
      tools.push(this.chartToolDefinition(source.clientId, descriptor))
    }
    for (const tool of this.hostToolDefinitions(source.clientId, document.exaApiKey?.trim())) {
      if (isEnabled(tool.name)) tools.push(tool)
    }
    return tools.map((tool) => withModeGate(tool, input.mode))
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
  private hostToolDefinitions(
    clientId: string,
    exaApiKey: string | undefined,
  ): readonly RuntimeToolDefinition[] {
    return [
      createWebSearchTool(
        createExaWebSearchProvider({
          ...(exaApiKey ? { apiKey: exaApiKey } : {}),
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

  /** 打开存储并装配应用服务。 */
  private async initializeRuntime(): Promise<AgentApplicationService> {
    const durable = await this.createSessions()
    try {
      const runtime = new AgentApplicationService({
        sessions: durable.sessions,
        createPlan: (input) => this.createPlan(input),
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

/** 校验配置名称在文档内唯一。 */
function requireUniqueProfileName(
  document: AgentSettingsDocument,
  name: string,
  exceptProfileId?: string,
): void {
  if (document.profiles.some((profile) => profile.name === name && profile.id !== exceptProfileId))
    throw new AgentRuntimeError(
      'INVALID_PAYLOAD',
      'The Provider configuration name is already in use.',
    )
}

/** 比较两份附加请求头是否等价。 */
function sameProviderHeaders(left: Record<string, string>, right: Record<string, string>): boolean {
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  return keys.every((key) => left[key] === right[key])
}
