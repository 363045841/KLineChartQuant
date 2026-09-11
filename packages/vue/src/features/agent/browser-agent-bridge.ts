// 浏览器 Agent bridge：Pi、会话和 Provider 请求全部运行在 Renderer。
import {
  AgentRuntimeError,
  AGENT_UI_PROTOCOL_VERSION,
  PiRunDriver,
  type PiRunPlan,
  createExaWebSearchProvider,
  createOpenAiCompatibleRuntimeSupport,
  createWebSearchTool,
  RuntimeToolCatalog,
  WEB_SEARCH_TOOL_METADATA,
  fetchOpenAiCompatibleModels,
  normalizeProviderBaseUrl,
  PROVIDER_SETTINGS_VERSION,
} from '@363045841yyt/klinechart-agent-runtime'

import type {
  AgentBridgeClient,
  AgentSessionSnapshot,
  AgentSessionView,
  AgentUiEvent,
  AgentUiEventInput,
  ProviderModelsResult,
  ProviderModelPoolEntry,
  ProviderModelView,
  ProviderProfileView,
  ProviderSaveInput,
  ProviderStatusView,
  ProviderTestInput,
  ProviderTestResult,
  StartRunInput,
  AgentContextItem,
  AgentRunContext,
  ProviderReasoningEffort,
  ProviderApiProtocol,
} from './agent-contracts'
import { ProviderModelPool } from './provider-model-pool'
import type {
  ProviderCredentialStore,
  OpenAiCompatibleProviderSettings,
  ProviderSettingsStore,
} from '@363045841yyt/klinechart-agent-runtime'
import {
  getRegisteredChartTools,
  type ChartAgentController,
} from '@363045841yyt/klinechart-core/controllers'
import { formatTimestamp } from '@363045841yyt/klinechart-core'
import type { RuntimeToolDefinition } from '@363045841yyt/klinechart-agent-runtime'

const PROVIDER_PROFILES_STORAGE_KEY = 'agent.provider.profiles'
const PROVIDER_MODEL_POOL_STORAGE_KEY = 'agent.provider.model-pool'
const ENABLED_TOOLS_STORAGE_KEY = 'agent.enabled-tools'

type DrawingCreateError = Error & {
  readonly code?: string
  readonly details?: Readonly<Record<string, unknown>>
}

interface DrawingCreateFailureDetail {
  readonly code: string
  readonly message: string
  readonly field: string
  readonly expected: string
  readonly recovery: string
}

/** 将可预期的绘图创建失败压缩为 Agent 可据此重试的结果。 */
function drawingCreateFailure(
  error: unknown,
  agent: ChartAgentController,
): {
  content: string
  summary: string
  failure: { code: string; message: string; retryable: boolean; recommendedAction: string }
} | null {
  if (!(error instanceof Error)) return null
  const drawingError = error as DrawingCreateError
  const details = drawingError.details
  let detail: DrawingCreateFailureDetail

  switch (drawingError.code) {
    case 'DRAWING_UNKNOWN_PANE':
      detail = {
        code: 'UNKNOWN_PANE_ID',
        message: error.message,
        field: 'paneId',
        expected: agent.getAvailableDrawingPaneIds().join(', '),
        recovery: `Use paneId: ${agent.getAvailableDrawingPaneIds().join(', ')}.`,
      }
      break
    case 'DRAWING_INVALID_ANCHOR_COUNT':
      detail = {
        code: 'INVALID_ANCHOR_COUNT',
        message: error.message,
        field: 'anchors',
        expected: `${details?.expected} anchors for ${details?.kind}`,
        recovery: `Use exactly ${details?.expected} anchors for ${details?.kind}.`,
      }
      break
    case 'DRAWING_ANCHOR_NOT_FOUND':
      detail = {
        code: 'ANCHOR_DATE_NOT_FOUND',
        message: error.message,
        field: 'anchors',
        expected: 'a date present in the loaded chart data',
        recovery: 'Replace the anchor date with a date present in the loaded chart data.',
      }
      break
    case 'DRAWING_INVALID_ANCHOR':
      detail = {
        code: 'INVALID_ANCHOR_VALUE',
        message: error.message,
        field: 'anchors',
        expected: 'a finite price and a valid UTC date',
        recovery: 'Use a finite price and a valid UTC date.',
      }
      break
    default:
      if (!(error instanceof TypeError)) return null
      detail = {
        code: 'INVALID_TOOL_INPUT',
        message: error.message,
        field: 'input',
        expected: 'valid drawing_create parameters',
        recovery: 'Correct the invalid field and retry drawing_create.',
      }
  }
  const failure = {
    code: detail.code,
    message: detail.message,
    retryable: true,
    recommendedAction: detail.recovery,
  }
  return {
    content: JSON.stringify({ success: false, error: detail, stateChanged: false }),
    summary: failure.message,
    failure,
  }
}

interface BrowserProviderProfile {
  name: string
  apiKey: string
  exaApiKey?: string
  settings?: OpenAiCompatibleProviderSettings
  connection?: BrowserProviderConnection
  active: boolean
}

/** Provider 连接配置独立于运行模型保存，便于在 Composer 中切换模型。 */
interface BrowserProviderConnection {
  baseUrl: string
  headers: Record<string, string>
  protocol: ProviderApiProtocol
}

/** Browser 宿主解析运行时工具所需的最小上下文。 */
interface BrowserToolContext {
  readonly agent: ChartAgentController | null | undefined
  readonly readOnly: boolean
}

type RegisteredChartTool = ReturnType<typeof getRegisteredChartTools>[number]

// 移除 Pi SDK 的浏览器诊断头，避免不支持这些头的 OpenAI-compatible Provider 拒绝 CORS 预检。
async function fetchBrowserProvider(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers)
  for (const name of [...headers.keys()]) {
    if (name.startsWith('x-stainless-')) headers.delete(name)
  }
  return fetch(input, { ...init, headers })
}

/** 管理浏览器端唯一的 Provider 配置数组；内存优先，写入时同步持久化。 */
class BrowserProviderProfiles {
  private cache: BrowserProviderProfile[] | undefined

  read(): BrowserProviderProfile[] {
    return this.models().map((profile) => ({ ...profile }))
  }

  write(profiles: BrowserProviderProfile[]): void {
    this.cache = profiles.map((profile) => ({ ...profile }))
    window.localStorage.setItem(PROVIDER_PROFILES_STORAGE_KEY, JSON.stringify(this.cache))
  }

  active(): BrowserProviderProfile | undefined {
    return this.models().find((profile) => profile.active)
  }

  select(name: string): void {
    this.write(this.models().map((profile) => ({ ...profile, active: profile.name === name })))
  }

  /** 重命名配置，保持其激活状态与其余配置不变。 */
  rename(previousName: string, nextName: string): void {
    this.write(
      this.models().map((profile) =>
        profile.name === previousName ? { ...profile, name: nextName } : profile,
      ),
    )
  }

  /** 移除配置；若移除的是激活配置，则将剩余配置中的第一个设为激活。 */
  remove(name: string): void {
    const remaining = this.models().filter((profile) => profile.name !== name)
    const keepsActive = remaining.some((profile) => profile.active)
    this.write(
      keepsActive
        ? remaining
        : remaining.map((profile, index) => ({ ...profile, active: index === 0 })),
    )
  }

  updateActive(patch: Partial<Omit<BrowserProviderProfile, 'name' | 'active'>>): void {
    this.write(
      this.models().map((profile) => (profile.active ? { ...profile, ...patch } : profile)),
    )
  }

  /** 惰性载入持久化的配置数组，之后作为唯一内存真相源。 */
  private models(): readonly BrowserProviderProfile[] {
    this.cache ??= this.load()
    return this.cache
  }

  private load(): BrowserProviderProfile[] {
    const raw = window.localStorage.getItem(PROVIDER_PROFILES_STORAGE_KEY)
    if (!raw) return []
    try {
      const profiles = JSON.parse(raw)
      return Array.isArray(profiles) ? (profiles as BrowserProviderProfile[]) : []
    } catch {
      return []
    }
  }
}

/** 读取跨 Provider Profile 的扁平模型池。 */
function readStoredModelPool(): ProviderModelPoolEntry[] {
  const raw = window.localStorage.getItem(PROVIDER_MODEL_POOL_STORAGE_KEY)
  if (!raw) return []
  try {
    const models = JSON.parse(raw)
    return Array.isArray(models) ? (models as ProviderModelPoolEntry[]) : []
  } catch {
    return []
  }
}

/** 保存用户选择的已启用工具；首次使用时保持所有已注册工具启用，内存缓存避免重复读盘。 */
class BrowserEnabledTools {
  private cache: Set<string> | undefined

  read(defaultNames: readonly string[]): Set<string> {
    this.cache ??= this.parse(defaultNames)
    return new Set(this.cache)
  }

  write(names: ReadonlySet<string>): void {
    this.cache = new Set(names)
    window.localStorage.setItem(ENABLED_TOOLS_STORAGE_KEY, JSON.stringify([...this.cache]))
  }

  /** 解析持久化的工具名称；缺失或损坏时回退到全部注册名。 */
  private parse(defaultNames: readonly string[]): Set<string> {
    const raw = window.localStorage.getItem(ENABLED_TOOLS_STORAGE_KEY)
    if (!raw) return new Set(defaultNames)
    try {
      const names = JSON.parse(raw)
      return Array.isArray(names)
        ? new Set(names.filter((name): name is string => typeof name === 'string'))
        : new Set(defaultNames)
    } catch {
      return new Set(defaultNames)
    }
  }
}

class BrowserProviderCredentialStore implements ProviderCredentialStore {
  constructor(private readonly profiles: BrowserProviderProfiles) {}

  async read(signal?: AbortSignal): Promise<string | undefined> {
    signal?.throwIfAborted()
    return this.profiles.active()?.apiKey || undefined
  }

  async write(apiKey: string, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    this.profiles.updateActive({ apiKey })
  }

  async delete(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    this.profiles.updateActive({ apiKey: '' })
  }
}

class BrowserProviderSettingsStore implements ProviderSettingsStore {
  constructor(private readonly profiles: BrowserProviderProfiles) {}

  async read(signal?: AbortSignal): Promise<OpenAiCompatibleProviderSettings | undefined> {
    signal?.throwIfAborted()
    return this.profiles.active()?.settings
  }

  async write(settings: OpenAiCompatibleProviderSettings, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    this.profiles.updateActive({
      settings,
      connection: {
        baseUrl: settings.baseUrl,
        headers: settings.headers,
        protocol: settings.protocol,
      },
    })
  }
}

interface BrowserSession {
  view: AgentSessionView
  messages: AgentSessionSnapshot['messages']
  runs: AgentSessionSnapshot['runs']
  transcript: Array<NonNullable<PiRunPlan['transcript']>[number]>
}

interface ActiveRun {
  driver: PiRunDriver
  input: StartRunInput
}

interface BrowserAgentBridgeOptions {
  readonly getChartAgent?: () => ChartAgentController | null | undefined
}

/** 从 Core 快照投影 UI 与模型共享的最小上下文。 */
function projectContextItems(
  agent: ChartAgentController | null | undefined,
): ReadonlyArray<AgentContextItem> {
  const context = agent?.context()
  if (!context) return Object.freeze([])
  const items: AgentContextItem[] = []
  if (context.symbol) {
    items.push({
      kind: 'chart-symbol',
      value: { symbol: context.symbol, name: context.symbolName },
    })
  }
  if (context.visibleRange) {
    const formatOptions = { timeZone: context.timezone ?? undefined, showTime: true }
    items.push({
      kind: 'selected-time-range',
      value: {
        from: formatTimestamp(context.visibleRange.from, formatOptions),
        to: formatTimestamp(context.visibleRange.to, formatOptions),
      },
    })
  }
  if (context.selectedKLineBars) {
    items.push({
      kind: 'selected-kline-bars',
      value: { content: context.selectedKLineBars },
    })
  }
  if (context.drawingSelection) {
    items.push({
      kind: 'drawing-selection',
      value: {
        selectedIds: [...context.drawingSelection.selectedIds],
        drawings: context.drawingSelection.drawings.map((drawing) => ({
          id: drawing.id,
          kind: drawing.kind,
          paneId: drawing.paneId,
          visible: drawing.visible,
          locked: drawing.locked,
          zIndex: drawing.zIndex,
          anchors: drawing.anchors.map((anchor) => ({ ...anchor })),
          style: Object.fromEntries(
            Object.entries(drawing.style).filter(
              (entry): entry is [string, string | number] => entry[1] !== undefined,
            ),
          ),
        })),
      },
    })
  }
  return Object.freeze(
    items.map((item) => Object.freeze({ ...item, value: Object.freeze(item.value) })),
  )
}

export class BrowserAgentBridge implements AgentBridgeClient {
  private readonly listeners = new Set<(event: AgentUiEvent) => void>()
  private readonly modelPool = new ProviderModelPool(readStoredModelPool, (models) => {
    window.localStorage.setItem(PROVIDER_MODEL_POOL_STORAGE_KEY, JSON.stringify(models))
  })
  private readonly contextItemsListeners = new Set<
    (items: ReadonlyArray<AgentContextItem>) => void
  >()
  private readonly profiles = new BrowserProviderProfiles()
  private readonly enabledTools = new BrowserEnabledTools()
  private readonly toolCatalog = new RuntimeToolCatalog<BrowserToolContext>()
  private readonly credentials = new BrowserProviderCredentialStore(this.profiles)
  private readonly settings = new BrowserProviderSettingsStore(this.profiles)
  private readonly support
  private readonly sessions = new Map<string, BrowserSession>()
  private readonly activeRuns = new Map<string, ActiveRun>()
  // 每个会话只保留最近一次运行的输入用于重试，随运行次数不会增长，会话删除时清除。
  private readonly sessionRunInputs = new Map<string, StartRunInput>()
  private nextSession = 1
  private nextRun = 1
  private readonly getChartAgent: () => ChartAgentController | null | undefined
  private chartAgent: ChartAgentController | null = null
  private unsubscribeChartContextSource: (() => void) | undefined

  constructor(options: BrowserAgentBridgeOptions = {}) {
    this.getChartAgent = options.getChartAgent ?? (() => null)
    this.registerTools()
    this.support = createOpenAiCompatibleRuntimeSupport({
      credentials: this.credentials,
      settings: this.settings,
      fetch: fetchBrowserProvider,
      tools: (context) => {
        const enabledNames = this.enabledToolNames()
        return this.toolCatalog
          .resolve(this.toolContext(context.readOnly))
          .filter((tool) => enabledNames.has(tool.name))
      },
    })
    const session = this.createSessionRecord()
    this.sessions.set(session.view.id, session)
  }

  getContextItems(): ReadonlyArray<AgentContextItem> {
    return projectContextItems(this.chartAgent ?? this.getChartAgent())
  }

  subscribeContextItems(listener: (items: ReadonlyArray<AgentContextItem>) => void): () => void {
    this.bindChartAgent(this.getChartAgent())
    this.contextItemsListeners.add(listener)
    listener(this.getContextItems())
    return () => this.contextItemsListeners.delete(listener)
  }

  /** 绑定图表 controller；支持 Agent 面板先于图表完成挂载。 */
  bindChartAgent(agent: ChartAgentController | null | undefined): void {
    const next = agent ?? null
    if (this.chartAgent === next) return
    this.unsubscribeChartContextSource?.()
    this.chartAgent = next
    this.unsubscribeChartContextSource = next?.context.subscribe(() => this.publishContextItems())
    this.publishContextItems()
  }

  private publishContextItems(): void {
    const items = this.getContextItems()
    for (const listener of this.contextItemsListeners) listener(items)
  }

  async listSessions(): Promise<AgentSessionView[]> {
    return [...this.sessions.values()].map(({ view }) => view)
  }

  async openSession(sessionId: string): Promise<AgentSessionSnapshot> {
    const session = this.requireSession(sessionId)
    return {
      session: session.view,
      // 快照不能暴露内部会话数组，否则 UI reducer 的追加会与存储层写入重复。
      messages: session.messages.map((message) => ({ ...message })),
      toolCalls: [],
      runs: session.runs,
      lastSequence: 0,
    }
  }

  async getProviderStatus(): Promise<ProviderStatusView> {
    const status = await this.support.provider.getStatus()
    const profile = this.profiles.active()
    if (!profile) return status
    const connection = profile.connection
    if (!connection) return { ...status, profileName: profile.name }
    if (profile.settings) return { ...status, profileName: profile.name }
    return {
      state: 'not-configured',
      providerLabel: 'OpenAI-compatible',
      configured: true,
      baseUrl: connection.baseUrl,
      headers: connection.headers,
      protocol: connection.protocol,
      profileName: profile.name,
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
    return this.toolCatalog
      .list(this.toolContext(false))
      .map((tool) => ({ ...tool, enabled: tool.available && enabledNames.has(tool.name) }))
  }

  /** 保存用户对当前可用工具的启用选择。 */
  async setToolEnabled(name: string, enabled: boolean): Promise<void> {
    const availability = this.toolCatalog.check(name, this.toolContext(false))
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
    const tool = this.toolCatalog
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
    return this.toolCatalog.list(this.toolContext(false)).map((tool) => tool.name)
  }

  /** 返回当前 Browser 宿主中的运行时工具解析上下文。 */
  private toolContext(readOnly: boolean): BrowserToolContext {
    return { agent: this.getChartAgent(), readOnly }
  }

  /** 将图表与网络工具注册到同一个 Runtime 工具注册表。 */
  private registerTools(): void {
    for (const chartTool of getRegisteredChartTools()) {
      this.toolCatalog.register({
        ...chartTool.config,
        create: ({ agent, readOnly }) => {
          if (!agent || (readOnly && chartTool.config.safety !== 'read-only')) return undefined
          return this.createRegisteredTool(chartTool, agent)
        },
      })
    }
    this.toolCatalog.register({
      ...WEB_SEARCH_TOOL_METADATA,
      check: () =>
        this.webSearchApiKey() ? undefined : 'Enter an Exa API key to enable Web search.',
      create: () => this.createWebSearchTool(),
    })
  }

  /** 为已保存的 Exa Key 创建本次运行可用的网络搜索工具。 */
  private createWebSearchTool(): RuntimeToolDefinition {
    const apiKey = this.webSearchApiKey()
    if (!apiKey) throw new AgentRuntimeError('TOOL_NOT_ALLOWED', 'Web search is not configured.')
    return createWebSearchTool(createExaWebSearchProvider({ apiKey, fetch: fetchBrowserProvider }))
  }

  /** 返回当前 Profile 中保存的 Web search 凭据。 */
  private webSearchApiKey(): string | undefined {
    return this.profiles.active()?.exaApiKey?.trim() || undefined
  }

  /** 解析工具执行目标：命中原语宿主则用宿主，否则归属 Agent facade 自身工具。 */
  private chartToolTarget(tool: RegisteredChartTool, agent: ChartAgentController): object {
    const host = agent.toolHosts.find((candidate) => tool.owns(candidate))
    return host ?? agent
  }

  /** 将单个 Core 图表 API 适配为 Agent Runtime 工具，不复制领域能力。 */
  private createRegisteredTool(
    tool: RegisteredChartTool,
    agent: ChartAgentController,
  ): RuntimeToolDefinition {
    const sourceIds = agent.getAvailableMarketDataSourceIds()
    const drawingPaneIds = agent.getAvailableDrawingPaneIds()
    const target = this.chartToolTarget(tool, agent)
    return {
      ...tool.config,
      description: this.toolDescription(
        tool.config.name,
        tool.config.description,
        sourceIds,
        drawingPaneIds,
      ),
      reversible: false,
      summarizeInput: tool.summarizeInput,
      execute: async (input, context) => {
        context.signal.throwIfAborted()
        context.progress({ label: `Running ${tool.config.label}`, current: 1, total: 1 })
        let value: unknown
        try {
          value = await tool.execute(target, input, {
            signal: context.signal,
            progress: context.progress,
          })
        } catch (error) {
          if (tool.config.name !== 'drawing_create') throw error
          const failure = drawingCreateFailure(error, agent)
          if (!failure) throw error
          return failure
        }
        context.signal.throwIfAborted()
        return {
          content: typeof value === 'string' ? value : JSON.stringify(value),
          summary: Array.isArray(value) ? `Returned ${value.length} items.` : 'Tool completed.',
        }
      },
    }
  }

  /** 为依赖运行时资源的工具追加可用的精确标识。 */
  private toolDescription(
    name: string,
    description: string,
    sourceIds: ReadonlyArray<string>,
    drawingPaneIds: ReadonlyArray<string>,
  ): string {
    if (name === 'drawing_create') {
      const available = drawingPaneIds.length ? drawingPaneIds.join(', ') : 'none'
      return `${description} Available runtime paneIds: ${available}. Use only one of these exact values for paneId.`
    }
    if (name === 'comparison_create') {
      const available = sourceIds.length ? sourceIds.join(', ') : 'none'
      return `${description} Available runtime sourceIds: ${available}. Set source to one of these exact values when the compared instrument comes from a specific source; omit it to reuse the primary symbol's source.`
    }
    if (
      ![
        'instruments_query_name',
        'market_bars_query',
        'market_timeshare_query',
        'market_timeshare_range_query',
      ].includes(name)
    ) {
      return description
    }
    const available = sourceIds.length ? sourceIds.join(', ') : 'none'
    return `${description} Available runtime sourceIds: ${available}. When providing sourceId or sourceIds, use only these exact values; omit the field to allow automatic routing across every enabled source.`
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
    if (profile.active && this.activeRuns.size) {
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
    if (this.activeRuns.size) {
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
    const session = this.createSessionRecord()
    this.sessions.set(session.view.id, session)
    this.emit({ type: 'sessions.changed', sessions: await this.listSessions() })
    return session.view
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    const session = this.requireSession(sessionId)
    session.view = { ...session.view, title, updatedAt: Date.now() }
    this.emit({ type: 'sessions.changed', sessions: await this.listSessions() })
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (this.activeRuns.size)
      throw new AgentRuntimeError('RUN_ACTIVE', 'Stop the active Agent run first.')
    this.sessions.delete(sessionId)
    this.sessionRunInputs.delete(sessionId)
    this.emit({ type: 'sessions.changed', sessions: await this.listSessions() })
  }

  async startRun(input: StartRunInput): Promise<{ runId: string }> {
    const session = this.requireSession(input.sessionId)
    const runId = `run-${this.nextRun++}`
    const startedAt = Date.now()
    const driver = new PiRunDriver()
    const runInput: StartRunInput = {
      ...input,
      context: Object.freeze({ items: this.getContextItems() }) satisfies AgentRunContext,
    }
    this.activeRuns.set(runId, { driver, input: runInput })
    this.sessionRunInputs.set(input.sessionId, runInput)
    const transcript = [...session.transcript]
    session.transcript.push({ role: 'user', content: input.prompt, timestamp: startedAt })
    session.messages.push({
      id: `user-${runId}`,
      role: 'user',
      content: input.prompt,
      createdAt: startedAt,
    })
    session.runs.push({ id: runId, sessionId: input.sessionId, status: 'running', startedAt })
    this.emit({ type: 'run.started', runId, sessionId: input.sessionId, startedAt })
    this.emit({
      type: 'user.message.created',
      runId,
      sessionId: input.sessionId,
      message: session.messages.at(-1)!,
    })
    void this.run(driver, runId, runInput, session, transcript, startedAt)
    return { runId }
  }

  async cancelRun(runId: string): Promise<void> {
    this.activeRuns.get(runId)?.driver.abort()
  }

  async retryRun(runId: string): Promise<{ runId: string }> {
    const session = this.sessionOfRun(runId)
    const input = session ? this.sessionRunInputs.get(session.view.id) : undefined
    if (!input) throw new AgentRuntimeError('RUN_NOT_ACTIVE', 'The Agent run is unavailable.')
    return this.startRun(input)
  }

  async confirmTool(): Promise<void> {
    throw new AgentRuntimeError('RUN_NOT_ACTIVE', 'No tool confirmation is pending.')
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
    const profile: BrowserProviderProfile = {
      name: profileName,
      apiKey: input.apiKey?.trim() || (await this.credentials.read()) || '',
      exaApiKey: input.exaApiKey?.trim() || profiles[existingIndex]?.exaApiKey,
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

  subscribe(listener: (event: AgentUiEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private createSessionRecord(): BrowserSession {
    const id = `session-${this.nextSession++}`
    return {
      view: { id, title: 'New analysis', updatedAt: Date.now() },
      messages: [],
      runs: [],
      transcript: [],
    }
  }

  private requireSession(sessionId: string): BrowserSession {
    const session = this.sessions.get(sessionId)
    if (!session)
      throw new AgentRuntimeError('SESSION_NOT_FOUND', 'The Agent session was not found.')
    return session
  }

  /** 按 runId 反查所属会话，供重试恢复该会话最近一次运行的输入。 */
  private sessionOfRun(runId: string): BrowserSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.runs.some((run) => run.id === runId)) return session
    }
    return undefined
  }

  private async run(
    driver: PiRunDriver,
    runId: string,
    input: StartRunInput,
    session: BrowserSession,
    transcript: PiRunPlan['transcript'],
    startedAt: number,
  ): Promise<void> {
    try {
      const plan = await this.support.createPlan({
        sessionId: input.sessionId,
        runId,
        turnId: runId,
        lane: 'main',
        prompt: input.prompt,
        readOnly: input.readOnly,
        context: input.context,
        startedAt,
        userEntryId: `user-${runId}`,
      })
      const result = await driver.run({ ...plan, transcript }, async (event) => {
        this.emit({ ...event, runId, sessionId: input.sessionId })
      })
      const endedAt = Date.now()
      session.transcript.push({
        role: 'assistant',
        content: [{ type: 'text', text: result.text }],
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
        timestamp: endedAt,
      })
      session.messages.push({
        id: `assistant-${runId}`,
        role: 'assistant',
        content: result.text,
        createdAt: endedAt,
        ...(result.citations.length ? { citations: result.citations } : {}),
      })
      this.finish(session, runId, 'completed', endedAt)
      this.emit({
        type: 'run.completed',
        runId,
        sessionId: input.sessionId,
        endedAt,
        usage: result.usage,
      })
    } catch (error) {
      const endedAt = Date.now()
      const agentError =
        error instanceof AgentRuntimeError
          ? error
          : new AgentRuntimeError('PROVIDER_ERROR', 'The Provider request failed.')
      const cancelled = agentError.code === 'ABORTED'
      this.finish(session, runId, cancelled ? 'cancelled' : 'failed', endedAt)
      this.emit(
        cancelled
          ? { type: 'run.cancelled', runId, sessionId: input.sessionId, partial: false, endedAt }
          : {
              type: 'run.failed',
              runId,
              sessionId: input.sessionId,
              endedAt,
              error: agentError.toView(),
            },
      )
    } finally {
      this.activeRuns.delete(runId)
    }
  }

  private finish(
    session: BrowserSession,
    runId: string,
    status: 'completed' | 'cancelled' | 'failed',
    endedAt: number,
  ): void {
    const run = session.runs.find((item) => item.id === runId)
    if (run) Object.assign(run, { status, endedAt })
  }

  private emit(event: AgentUiEventInput): void {
    for (const listener of this.listeners)
      listener({ ...event, protocolVersion: AGENT_UI_PROTOCOL_VERSION })
  }
}
