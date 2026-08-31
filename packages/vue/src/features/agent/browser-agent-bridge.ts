// 浏览器 Agent bridge：Pi、会话和 Provider 请求全部运行在 Renderer。
import {
  AgentRuntimeError,
  AGENT_UI_PROTOCOL_VERSION,
  PiRunDriver,
  createIndicatorQueryTool,
  createInstrumentNameQueryTool,
  createOpenAiCompatibleRuntimeSupport,
  fetchOpenAiCompatibleModels,
  normalizeProviderBaseUrl,
  parseOpenAiCompatibleProviderSettings,
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
} from './agent-contracts'
import type {
  ProviderCredentialStore,
  OpenAiCompatibleProviderSettings,
  ProviderSettingsStore,
} from '@363045841yyt/klinechart-agent-runtime'
import type { ChartAgentController } from '@363045841yyt/klinechart-core/controllers'

const PROVIDER_API_KEY_STORAGE_KEY = 'agent.provider.apiKey'
const PROVIDER_SETTINGS_STORAGE_KEY = 'agent.provider.settings'
const PROVIDER_PROFILES_STORAGE_KEY = 'agent.provider.profiles'

interface BrowserProviderProfile {
  id: string
  name: string
  apiKey: string
  settings: OpenAiCompatibleProviderSettings
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

class BrowserProviderCredentialStore implements ProviderCredentialStore {
  async read(signal?: AbortSignal): Promise<string | undefined> {
    signal?.throwIfAborted()
    return window.localStorage.getItem(PROVIDER_API_KEY_STORAGE_KEY) ?? undefined
  }

  async write(apiKey: string, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    window.localStorage.setItem(PROVIDER_API_KEY_STORAGE_KEY, apiKey)
  }

  async delete(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    window.localStorage.removeItem(PROVIDER_API_KEY_STORAGE_KEY)
  }
}

class BrowserProviderSettingsStore implements ProviderSettingsStore {
  async read(signal?: AbortSignal): Promise<OpenAiCompatibleProviderSettings | undefined> {
    signal?.throwIfAborted()
    const raw = window.localStorage.getItem(PROVIDER_SETTINGS_STORAGE_KEY)
    if (!raw) return undefined
    try {
      const parsed = parseOpenAiCompatibleProviderSettings(JSON.parse(raw))
      if (parsed && JSON.stringify(parsed) !== raw) {
        window.localStorage.setItem(PROVIDER_SETTINGS_STORAGE_KEY, JSON.stringify(parsed))
      }
      return parsed
    } catch {
      window.localStorage.removeItem(PROVIDER_SETTINGS_STORAGE_KEY)
      return undefined
    }
  }

  async write(settings: OpenAiCompatibleProviderSettings, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    window.localStorage.setItem(PROVIDER_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  }
}

interface BrowserSession {
  view: AgentSessionView
  messages: AgentSessionSnapshot['messages']
  runs: AgentSessionSnapshot['runs']
}

interface ActiveRun {
  driver: PiRunDriver
  input: StartRunInput
}

interface BrowserAgentBridgeOptions {
  readonly getChartAgent?: () => ChartAgentController | null | undefined
}

function formatVisibleRange(
  range: ReturnType<ChartAgentController['getContext']>['visibleRange'],
): string | null {
  if (!range) return null
  const format = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return `${format.format(range.from)} - ${format.format(range.to)}`
}

function projectChartContext(agent: ChartAgentController | null | undefined) {
  const context = agent?.context()
  if (!context) return null
  return {
    symbol: context.symbol,
    period: context.period,
    visibleRange: formatVisibleRange(context.visibleRange),
    selectedBar: null,
  }
}

export class BrowserAgentBridge implements AgentBridgeClient {
  private readonly listeners = new Set<(event: AgentUiEvent) => void>()
  private readonly chartContextListeners = new Set<(context: ReturnType<typeof projectChartContext>) => void>()
  private readonly credentials = new BrowserProviderCredentialStore()
  private readonly settings = new BrowserProviderSettingsStore()
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
      tools: () => {
        const agent = this.getChartAgent()
        return agent
          ? [createIndicatorQueryTool(agent), createInstrumentNameQueryTool(agent)]
          : []
      },
    })
    const session = this.createSessionRecord()
    this.sessions.set(session.view.id, session)
  }

  getChartContext() {
    return projectChartContext(this.chartAgent ?? this.getChartAgent())
  }

  subscribeChartContext(listener: (context: ReturnType<typeof projectChartContext>) => void): () => void {
    this.bindChartAgent(this.getChartAgent())
    this.chartContextListeners.add(listener)
    listener(this.getChartContext())
    return () => this.chartContextListeners.delete(listener)
  }

  /** 绑定图表 controller；支持 Agent 面板先于图表完成挂载。 */
  bindChartAgent(agent: ChartAgentController | null | undefined): void {
    const next = agent ?? null
    if (this.chartAgent === next) return
    this.unsubscribeChartContextSource?.()
    this.chartAgent = next
    this.unsubscribeChartContextSource = next?.context.subscribe(() => this.publishChartContext())
    this.publishChartContext()
  }

  private publishChartContext(): void {
    const context = this.getChartContext()
    for (const listener of this.chartContextListeners) listener(context)
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
    return await this.support.provider.getStatus()
  }

  /** 返回已保存的 Provider 档案，不向界面暴露 API Key。 */
  async listProviderProfiles(): Promise<ProviderProfileView[]> {
    return (await this.readProfiles()).map(({ id, name, settings }) => ({
      id,
      name,
      baseUrl: settings.baseUrl,
      modelId: settings.modelId,
      modelName: settings.modelName,
      protocol: settings.protocol,
    }))
  }

  /** 原子切换当前运行时使用的 Provider 档案。 */
  async selectProviderProfile(profileId: string): Promise<void> {
    if (this.activeRuns.size) {
      throw new AgentRuntimeError('RUN_ACTIVE', 'Stop the active Agent run before switching Provider.')
    }
    const profile = (await this.readProfiles()).find((item) => item.id === profileId)
    if (!profile) throw new AgentRuntimeError('PROVIDER_ERROR', 'The Provider configuration was not found.')
    await this.credentials.write(profile.apiKey)
    await this.settings.write(profile.settings)
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
    this.activeRuns.set(runId, { driver, input })
    this.runInputs.set(runId, input)
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
    void this.run(driver, runId, input, session, startedAt)
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
    const baseUrl = normalizeProviderBaseUrl(input.baseUrl)
    const modelId = input.model.trim()
    if (!modelId) {
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'Enter a model ID before saving.',
      )
    }
    const apiKey = input.apiKey?.trim() || (await this.credentials.read())
    if (!apiKey) throw new AgentRuntimeError('PROVIDER_NOT_CONFIGURED', 'Enter an API key before saving.')
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
    await this.credentials.write(apiKey)
    await this.settings.write(settings)
    const profiles = await this.readProfiles()
    const existingIndex = input.profileId
      ? profiles.findIndex((item) => item.id === input.profileId)
      : profiles.findIndex(
          (item) =>
            item.settings.baseUrl === settings.baseUrl &&
            item.settings.modelId === settings.modelId &&
            item.settings.protocol === settings.protocol,
        )
    const profile: BrowserProviderProfile = {
      id: existingIndex >= 0 ? profiles[existingIndex]!.id : `provider-${globalThis.crypto.randomUUID()}`,
      name: input.profileName.trim() || settings.modelName,
      apiKey,
      settings,
    }
    if (existingIndex >= 0) profiles[existingIndex] = profile
    else profiles.push(profile)
    this.writeProfiles(profiles)
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
    return { view: { id, title: 'New analysis', updatedAt: Date.now() }, messages: [], runs: [] }
  }

  /** 读取档案集合；首次读取时将旧版单配置迁移为一个档案。 */
  private async readProfiles(): Promise<BrowserProviderProfile[]> {
    const raw = window.localStorage.getItem(PROVIDER_PROFILES_STORAGE_KEY)
    if (raw) {
      try {
        const value = JSON.parse(raw)
        if (Array.isArray(value)) {
          const profiles = value.filter((item): item is BrowserProviderProfile => {
            if (typeof item !== 'object' || item === null) return false
            const profile = item as Record<string, unknown>
            try {
              return (
                typeof profile.id === 'string' &&
                typeof profile.name === 'string' &&
                typeof profile.apiKey === 'string' &&
                Boolean(parseOpenAiCompatibleProviderSettings(profile.settings))
              )
            } catch {
              return false
            }
          })
          if (profiles.length !== value.length) this.writeProfiles(profiles)
          return profiles
        }
      } catch {}
      window.localStorage.removeItem(PROVIDER_PROFILES_STORAGE_KEY)
    }
    const [settings, apiKey] = await Promise.all([this.settings.read(), this.credentials.read()])
    if (!settings || !apiKey) return []
    const profiles = [
      {
        id: `provider-${globalThis.crypto.randomUUID()}`,
        name: settings.modelName,
        apiKey,
        settings,
      },
    ]
    this.writeProfiles(profiles)
    return profiles
  }

  /** 写入完整档案快照，避免配置与对应凭据分离。 */
  private writeProfiles(profiles: BrowserProviderProfile[]): void {
    window.localStorage.setItem(PROVIDER_PROFILES_STORAGE_KEY, JSON.stringify(profiles))
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
        startedAt,
        userEntryId: `user-${runId}`,
      })
      const result = await driver.run(plan, async (event) => {
        this.emit({ ...event, runId, sessionId: input.sessionId })
      })
      const endedAt = Date.now()
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
