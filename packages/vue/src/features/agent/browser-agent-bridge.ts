// 浏览器 Agent bridge：Pi、会话和 Provider 请求全部运行在 Renderer。
import {
  AgentRuntimeError,
  PiRunDriver,
  PROVIDER_SETTINGS_VERSION,
  createOpenAiCompatibleRuntimeSupport,
  fetchOpenAiCompatibleModels,
  normalizeProviderBaseUrl,
  parseOpenAiCompatibleProviderSettings,
  providerHttpError,
} from '@363045841yyt/klinechart-agent-runtime'

import type {
  AgentBridgeClient,
  AgentSessionSnapshot,
  AgentSessionView,
  AgentUiEvent,
  AgentUiEventInput,
  ProviderModelsInput,
  ProviderModelsResult,
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

const PROVIDER_API_KEY_STORAGE_KEY = 'agent.provider.apiKey'
const PROVIDER_SETTINGS_STORAGE_KEY = 'agent.provider.settings'

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
      return parseOpenAiCompatibleProviderSettings(JSON.parse(raw))
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

export class BrowserAgentBridge implements AgentBridgeClient {
  private readonly listeners = new Set<(event: AgentUiEvent) => void>()
  private readonly credentials = new BrowserProviderCredentialStore()
  private readonly settings = new BrowserProviderSettingsStore()
  private readonly support = createOpenAiCompatibleRuntimeSupport({
    credentials: this.credentials,
    settings: this.settings,
    fetch: fetchBrowserProvider,
  })
  private readonly sessions = new Map<string, BrowserSession>()
  private readonly activeRuns = new Map<string, ActiveRun>()
  private readonly runInputs = new Map<string, StartRunInput>()
  private nextSession = 1
  private nextRun = 1

  constructor() {
    const session = this.createSessionRecord()
    this.sessions.set(session.view.id, session)
  }

  async listSessions(): Promise<AgentSessionView[]> {
    return [...this.sessions.values()].map(({ view }) => view)
  }

  async openSession(sessionId: string): Promise<AgentSessionSnapshot> {
    const session = this.requireSession(sessionId)
    return {
      session: session.view,
      messages: session.messages,
      toolCalls: [],
      runs: session.runs,
      lastSequence: 0,
    }
  }

  async getProviderStatus(): Promise<ProviderStatusView> {
    return await this.support.provider.getStatus()
  }

  listProviderModels(input: ProviderModelsInput): Promise<ProviderModelsResult> {
    return fetchOpenAiCompatibleModels(input)
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
    const startedAt = Date.now()
    const { models, refreshedAt } = await fetchOpenAiCompatibleModels(input)
    const selected = models.find((model) => model.id === input.model)
    if (!selected) throw providerHttpError(404)
    const apiKey = input.apiKey?.trim() || (await this.credentials.read())
    if (!apiKey) {
      throw new AgentRuntimeError('PROVIDER_NOT_CONFIGURED', 'Enter an API key before testing.')
    }
    const testedAt = Date.now()
    await this.credentials.write(apiKey)
    await this.settings.write({
      version: PROVIDER_SETTINGS_VERSION,
      baseUrl: normalizeProviderBaseUrl(input.baseUrl),
      modelId: selected.id,
      modelName: selected.name,
      compatibility: 'compatible',
      lastTestedAt: testedAt,
      lastModelsRefreshAt: refreshedAt,
    })
    const latencyMs = Math.max(0, testedAt - startedAt)
    const result: ProviderTestResult = {
      compatible: true,
      model: selected.id,
      latencyMs,
      stages: [{ stage: 'catalog', ok: true, latencyMs }],
    }
    this.emit({ type: 'provider.status.changed', status: await this.getProviderStatus() })
    return result
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
    for (const listener of this.listeners) listener({ ...event, protocolVersion: 2 })
  }
}
