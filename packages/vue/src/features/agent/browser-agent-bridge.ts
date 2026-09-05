// 浏览器 Agent bridge：Pi、会话和 Provider 请求全部运行在 Renderer。
import {
  AgentRuntimeError,
  AGENT_UI_PROTOCOL_VERSION,
  PiRunDriver,
  type PiRunPlan,
  createOpenAiCompatibleRuntimeSupport,
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
  ProviderModelsInput,
  ProviderModelsResult,
  ProviderProfileView,
  ProviderSaveInput,
  ProviderStatusView,
  ProviderTestInput,
  ProviderTestResult,
  StartRunInput,
  AgentContextItem,
  AgentRunContext,
} from './agent-contracts'
import type {
  ProviderCredentialStore,
  OpenAiCompatibleProviderSettings,
  ProviderSettingsStore,
} from '@363045841yyt/klinechart-agent-runtime'
import {
  getRegisteredChartTools,
  type ChartAgentController,
} from '@363045841yyt/klinechart-core/controllers'
import type { RuntimeToolDefinition } from '@363045841yyt/klinechart-agent-runtime'

const PROVIDER_PROFILES_STORAGE_KEY = 'agent.provider.profiles'
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
  settings?: OpenAiCompatibleProviderSettings
  active: boolean
}

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

/** 管理浏览器端唯一的 Provider 配置数组。 */
class BrowserProviderProfiles {
  read(): BrowserProviderProfile[] {
    const raw = window.localStorage.getItem(PROVIDER_PROFILES_STORAGE_KEY)
    if (!raw) return []
    try {
      const profiles = JSON.parse(raw)
      return Array.isArray(profiles) ? (profiles as BrowserProviderProfile[]) : []
    } catch {
      return []
    }
  }

  write(profiles: BrowserProviderProfile[]): void {
    window.localStorage.setItem(PROVIDER_PROFILES_STORAGE_KEY, JSON.stringify(profiles))
  }

  active(): BrowserProviderProfile | undefined {
    return this.read().find((profile) => profile.active)
  }

  select(name: string): void {
    this.write(this.read().map((profile) => ({ ...profile, active: profile.name === name })))
  }

  updateActive(patch: Partial<Omit<BrowserProviderProfile, 'name' | 'active'>>): void {
    this.write(this.read().map((profile) => (profile.active ? { ...profile, ...patch } : profile)))
  }
}

/** 保存用户选择的已启用工具；首次使用时保持所有已注册工具启用。 */
class BrowserEnabledTools {
  read(defaultNames: readonly string[]): Set<string> {
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

  write(names: ReadonlySet<string>): void {
    window.localStorage.setItem(ENABLED_TOOLS_STORAGE_KEY, JSON.stringify([...names]))
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
    this.profiles.updateActive({ settings })
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
    items.push({ kind: 'selected-time-range', value: { ...context.visibleRange } })
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
  private readonly contextItemsListeners = new Set<
    (items: ReadonlyArray<AgentContextItem>) => void
  >()
  private readonly profiles = new BrowserProviderProfiles()
  private readonly enabledTools = new BrowserEnabledTools()
  private readonly credentials = new BrowserProviderCredentialStore(this.profiles)
  private readonly settings = new BrowserProviderSettingsStore(this.profiles)
  private readonly support
  private readonly sessions = new Map<string, BrowserSession>()
  private readonly activeRuns = new Map<string, ActiveRun>()
  private readonly runInputs = new Map<string, StartRunInput>()
  private nextSession = 1
  private nextRun = 1
  private readonly getChartAgent: () => ChartAgentController | null | undefined
  private chartAgent: ChartAgentController | null = null
  private unsubscribeChartContextSource: (() => void) | undefined

  constructor(options: BrowserAgentBridgeOptions = {}) {
    this.getChartAgent = options.getChartAgent ?? (() => null)
    this.support = createOpenAiCompatibleRuntimeSupport({
      credentials: this.credentials,
      settings: this.settings,
      fetch: fetchBrowserProvider,
      tools: (context) => {
        const agent = this.getChartAgent()
        if (!agent) return []
        const enabledNames = this.enabledToolNames()
        const registeredTools = this.createRegisteredTools(agent, context.readOnly)
        return registeredTools.filter((tool) => enabledNames.has(tool.name))
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
    const profileName = this.profiles.active()?.name
    return profileName ? { ...status, profileName } : status
  }

  /** 返回可在当前 Browser 宿主中管理的已注册工具。 */
  async listTools() {
    const enabledNames = this.enabledToolNames()
    return getRegisteredChartTools().map(({ config }) => ({
      name: config.name,
      label: config.label,
      description: config.description,
      enabled: enabledNames.has(config.name),
    }))
  }

  /** 保存用户对已注册工具的启用选择。 */
  async setToolEnabled(name: string, enabled: boolean): Promise<void> {
    const registeredNames = new Set(getRegisteredChartTools().map((tool) => tool.config.name))
    if (!registeredNames.has(name)) {
      throw new AgentRuntimeError('INVALID_PAYLOAD', `Unknown Agent tool '${name}'.`)
    }
    const enabledNames = this.enabledToolNames()
    if (enabled) enabledNames.add(name)
    else enabledNames.delete(name)
    this.enabledTools.write(enabledNames)
  }

  /** 手动执行一个已注册工具，复用 Agent 调用的 schema 与宿主绑定。 */
  async debugTool(name: string, input: unknown) {
    const agent = this.getChartAgent()
    if (!agent) {
      throw new AgentRuntimeError('TARGET_LOST', 'A chart is required to debug this tool.')
    }
    const tool = this.createRegisteredTools(agent, false).find((item) => item.name === name)
    if (!tool) {
      throw new AgentRuntimeError('INVALID_PAYLOAD', `Unknown Agent tool '${name}'.`)
    }
    const result = await tool.execute(input, {
      runId: `debug:${globalThis.crypto.randomUUID()}`,
      toolCallId: `debug:${globalThis.crypto.randomUUID()}`,
      signal: new AbortController().signal,
      progress: () => undefined,
    })
    return { content: result.content, summary: result.summary }
  }

  /** 读取已注册工具的当前启用集合，并忽略旧版本遗留的未知名称。 */
  private enabledToolNames(): Set<string> {
    const registeredNames = getRegisteredChartTools().map((tool) => tool.config.name)
    const enabledNames = this.enabledTools.read(registeredNames)
    return new Set([...enabledNames].filter((name) => registeredNames.includes(name)))
  }

  /** 将 Core 注册的图表 API 适配为 Agent Runtime 工具，不复制领域能力。 */
  private createRegisteredTools(
    agent: ChartAgentController,
    readOnly: boolean,
  ): readonly RuntimeToolDefinition[] {
    const sourceIds = agent.getAvailableMarketDataSourceIds()
    const drawingPaneIds = agent.getAvailableDrawingPaneIds()
    return getRegisteredChartTools()
      .filter((tool) => !readOnly || tool.config.safety === 'read-only')
      .map((tool) => ({
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
            value = await tool.execute(agent, input, {
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
      }))
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
    return this.profiles.read().map(({ name, settings }) => ({
      name,
      baseUrl: settings?.baseUrl ?? '',
      modelId: settings?.modelId ?? '',
      modelName: settings?.modelName ?? '',
      protocol: settings?.protocol ?? 'openai-responses',
    }))
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
    this.emit({ type: 'provider.status.changed', status: await this.getProviderStatus() })
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
    this.emit({ type: 'provider.status.changed', status: await this.getProviderStatus() })
  }

  async listProviderModels(input: ProviderModelsInput): Promise<ProviderModelsResult> {
    const apiKey = input.apiKey?.trim() || (await this.credentials.read())
    return fetchOpenAiCompatibleModels({ ...input, apiKey })
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
    for (const [runId, input] of this.runInputs) {
      if (input.sessionId === sessionId) this.runInputs.delete(runId)
    }
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
    this.runInputs.set(runId, runInput)
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
    const input = this.runInputs.get(runId)
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
    const modelId = input.model.trim()
    if (!modelId) {
      throw new AgentRuntimeError('PROVIDER_NOT_CONFIGURED', 'Enter a model ID before saving.')
    }
    const apiKey = input.apiKey?.trim() || (await this.credentials.read())
    if (!apiKey)
      throw new AgentRuntimeError('PROVIDER_NOT_CONFIGURED', 'Enter an API key before saving.')
    const profiles = this.profiles.read()
    const settings: OpenAiCompatibleProviderSettings = {
      version: PROVIDER_SETTINGS_VERSION,
      baseUrl,
      modelId,
      modelName: input.modelName.trim() || modelId,
      protocol: input.protocol,
      compatibility: 'compatible',
      lastTestedAt: Date.now(),
      lastModelsRefreshAt: Date.now(),
    }
    const existingIndex = profiles.findIndex((item) => item.name === profileName)
    const profile: BrowserProviderProfile = {
      name: profileName,
      apiKey,
      settings,
      active: true,
    }
    this.profiles.write(
      (existingIndex >= 0
        ? profiles.map((item, index) => (index === existingIndex ? profile : item))
        : [...profiles, profile]
      ).map((item) => ({ ...item, active: item.name === profileName })),
    )
    this.emit({ type: 'provider.status.changed', status: await this.getProviderStatus() })
  }

  async deleteProviderCredential(): Promise<void> {
    await this.support.provider.deleteCredential()
    this.emit({ type: 'provider.status.changed', status: await this.getProviderStatus() })
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
