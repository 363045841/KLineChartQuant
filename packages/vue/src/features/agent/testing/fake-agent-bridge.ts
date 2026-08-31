/** Drive complete UI states deterministically without Provider or chart business logic. */
import {
  fetchOpenAiCompatibleModels,
  providerHttpError,
} from '@363045841yyt/klinechart-agent-runtime'

import {
  AGENT_UI_PROTOCOL_VERSION,
  type AgentBridgeClient,
  type ChartContextView,
  type AgentSessionView,
  type AgentSessionSnapshot,
  type AgentRunUiEventInput,
  type AgentUiEvent,
  type AgentUiEventInput,
  type ConfirmationView,
  type ProviderModelsInput,
  type ProviderModelsResult,
  type ProviderProfileView,
  type ProviderSaveInput,
  type ProviderStatusView,
  type ProviderTestInput,
  type ProviderTestResult,
  type StartRunInput,
  type AgentToolView,
  type AgentToolDebugResult,
  type ToolCallView,
} from '../agent-contracts'

interface FakeRun {
  id: string
  sessionId: string
  prompt: string
  readOnly: boolean
  tool?: ToolCallView
  timers: Set<ReturnType<typeof setTimeout>>
  hasMutation: boolean
}

interface PendingConfirmation {
  runId: string
  request: ConfirmationView
}

export interface FakeAgentBridgeOptions {
  stepDelayMs?: number
  providerConfigured?: boolean
}

export class FakeAgentBridge implements AgentBridgeClient {
  private readonly listeners = new Set<(event: AgentUiEvent) => void>()
  private readonly runs = new Map<string, FakeRun>()
  private readonly confirmations = new Map<string, PendingConfirmation>()
  private readonly stepDelayMs: number
  private sessions: AgentSessionView[] = [
    { id: 'session-1', title: 'BTC momentum review', updatedAt: Date.now() },
  ]
  private provider: ProviderStatusView
  private profiles: ProviderProfileView[] = []
  private tools: AgentToolView[] = [
    {
      name: 'instruments_query_name',
      label: 'Query instrument name',
      description: 'Look up a security name by its exact symbol.',
      enabled: true,
    },
  ]
  private nextSessionId = 2
  private nextRunId = 1
  private readonly chartContext: ChartContextView = {
    symbol: 'BTCUSDT',
    period: '1h',
    visibleRange: 'Latest 7 days',
    selectedBar: null,
  }

  constructor(options: FakeAgentBridgeOptions = {}) {
    this.stepDelayMs = options.stepDelayMs ?? 90
    this.provider = options.providerConfigured
      ? {
          state: 'connected',
          providerLabel: 'OpenAI-compatible',
          configured: true,
          modelId: 'Scripted Alpha',
          modelLabel: 'Scripted Alpha',
          protocol: 'openai-completions',
          compatibility: 'compatible',
        }
      : {
          state: 'not-configured',
          providerLabel: 'OpenAI-compatible',
          configured: false,
          compatibility: 'unknown',
        }
  }

  getChartContext(): ChartContextView {
    return this.chartContext
  }

  subscribeChartContext(listener: (context: ChartContextView | null) => void): () => void {
    listener(this.chartContext)
    return () => {}
  }

  async listSessions(): Promise<AgentSessionView[]> {
    return [...this.sessions]
  }

  async openSession(sessionId: string): Promise<AgentSessionSnapshot> {
    const session = this.sessions.find((item) => item.id === sessionId)
    if (!session) throw new Error(`Unknown fake session: ${sessionId}`)
    return { session, messages: [], toolCalls: [], runs: [], lastSequence: 0 }
  }

  async getProviderStatus(): Promise<ProviderStatusView> {
    return this.provider
  }

  async listTools(): Promise<AgentToolView[]> {
    return this.tools.map((tool) => ({ ...tool }))
  }

  async setToolEnabled(name: string, enabled: boolean): Promise<void> {
    const tool = this.tools.find((item) => item.name === name)
    if (!tool) throw new Error(`Unknown fake Agent tool: ${name}`)
    tool.enabled = enabled
  }

  async debugTool(name: string, input: unknown): Promise<AgentToolDebugResult> {
    if (!this.tools.some((tool) => tool.name === name)) throw new Error(`Unknown fake Agent tool: ${name}`)
    return { content: JSON.stringify({ input }), summary: 'Fake tool completed.' }
  }

  async listProviderModels(input: ProviderModelsInput): Promise<ProviderModelsResult> {
    return fetchOpenAiCompatibleModels(input)
  }

  async listProviderProfiles(): Promise<ProviderProfileView[]> {
    return [...this.profiles]
  }

  async createProviderProfile(profileName: string): Promise<void> {
    if (this.profiles.some((profile) => profile.name === profileName)) {
      throw new Error(`Duplicate fake Provider profile: ${profileName}`)
    }
    this.profiles.push({
      name: profileName,
      baseUrl: '',
      modelId: '',
      modelName: '',
      protocol: 'openai-responses',
    })
  }

  async selectProviderProfile(profileName: string): Promise<void> {
    const profile = this.profiles.find((item) => item.name === profileName)
    if (!profile) throw new Error(`Unknown fake Provider profile: ${profileName}`)
    this.provider = {
      state: 'connected',
      providerLabel: 'OpenAI-compatible',
      configured: true,
      baseUrl: profile.baseUrl,
      modelId: profile.modelId,
      modelLabel: profile.modelName,
      profileName: profile.name,
      protocol: profile.protocol,
      compatibility: 'compatible',
    }
    this.emit({ type: 'provider.status.changed', status: this.provider })
  }

  async createSession(): Promise<AgentSessionView> {
    const session = {
      id: `session-${this.nextSessionId++}`,
      title: 'New analysis',
      updatedAt: Date.now(),
    }
    this.sessions = [session, ...this.sessions]
    this.emit({ type: 'sessions.changed', sessions: [...this.sessions] })
    return session
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    this.sessions = this.sessions.map((session) =>
      session.id === sessionId ? { ...session, title, updatedAt: Date.now() } : session,
    )
    this.emit({ type: 'sessions.changed', sessions: [...this.sessions] })
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions = this.sessions.filter((session) => session.id !== sessionId)
    this.emit({ type: 'sessions.changed', sessions: [...this.sessions] })
  }

  async startRun(input: StartRunInput): Promise<{ runId: string }> {
    const runId = `run-${this.nextRunId++}`
    const run: FakeRun = {
      id: runId,
      sessionId: input.sessionId,
      prompt: input.prompt,
      readOnly: input.readOnly,
      timers: new Set(),
      hasMutation: false,
    }
    this.runs.set(runId, run)
    this.startScript(run)
    return { runId }
  }

  async cancelRun(runId: string): Promise<void> {
    const run = this.runs.get(runId)
    if (!run) return
    this.clearTimers(run)
    this.emitRun(run, { type: 'run.cancelling' })
    this.emitRun(run, {
      type: 'run.cancelled',
      partial: run.hasMutation,
      endedAt: Date.now(),
    })
  }

  async retryRun(runId: string): Promise<{ runId: string }> {
    const run = this.runs.get(runId)
    if (!run) throw new Error(`Unknown fake run: ${runId}`)
    return this.startRun({ sessionId: run.sessionId, prompt: run.prompt, readOnly: run.readOnly })
  }

  async confirmTool(confirmationId: string, decision: 'confirmed' | 'rejected'): Promise<void> {
    const pending = this.confirmations.get(confirmationId)
    if (!pending) return
    const run = this.runs.get(pending.runId)
    if (!run) return

    this.emitRun(run, {
      type: 'tool.confirmation.resolved',
      confirmationId,
      decision,
    })
    this.confirmations.delete(confirmationId)

    if (decision === 'confirmed') {
      run.hasMutation = true
      const finished = {
        ...run.tool!,
        status: 'succeeded' as const,
        resultSummary: 'All 4 drawings cleared. Undo is available.',
        finishedAt: Date.now(),
        durationMs: 182,
        undoToken: `undo-${run.id}`,
      }
      this.emitRun(run, { type: 'tool.finished', result: finished })
      this.finishRun(run, 'The drawings were cleared and the chart state was verified.')
    } else {
      this.finishRun(run, 'No chart changes were made because you rejected the action.')
    }
  }

  async undoTurn(runId: string): Promise<void> {
    const run = this.runs.get(runId)
    if (!run?.tool) return
    this.emitRun(run, { type: 'tool.undone', toolCallId: run.tool.id, undoneAt: Date.now() })
  }

  async testProvider(input: ProviderTestInput): Promise<ProviderTestResult> {
    const startedAt = Date.now()
    const { models } = await this.listProviderModels(input)
    if (!models.some((model) => model.id === input.model)) throw providerHttpError(404)
    await new Promise<void>((resolve) => setTimeout(resolve, this.stepDelayMs))
    return {
      compatible: true,
      model: input.model,
      latencyMs: Math.max(0, Date.now() - startedAt),
      stages: [{ stage: 'catalog', ok: true, latencyMs: Math.max(0, Date.now() - startedAt) }],
    }
  }

  async saveProvider(input: ProviderSaveInput): Promise<void> {
    const profile: ProviderProfileView = {
      name: input.profileName,
      baseUrl: input.baseUrl,
      modelId: input.model,
      modelName: input.modelName,
      protocol: input.protocol,
    }
    const existingIndex = this.profiles.findIndex((item) => item.name === input.profileName)
    if (existingIndex >= 0) this.profiles[existingIndex] = profile
    else this.profiles.push(profile)
    this.provider = {
      state: 'connected',
      providerLabel: 'OpenAI-compatible',
      configured: true,
      baseUrl: input.baseUrl,
      modelId: input.model,
      modelLabel: input.modelName,
      profileName: input.profileName,
      protocol: input.protocol,
      compatibility: 'compatible',
    }
    this.emit({ type: 'provider.status.changed', status: this.provider })
  }

  async deleteProviderCredential(): Promise<void> {
    this.provider = {
      state: 'not-configured',
      providerLabel: 'OpenAI-compatible',
      configured: false,
      baseUrl: this.provider.baseUrl,
      modelId: this.provider.modelId,
      modelLabel: this.provider.modelLabel,
      protocol: this.provider.protocol,
      compatibility: 'unknown',
    }
    this.emit({ type: 'provider.status.changed', status: this.provider })
  }

  subscribe(listener: (event: AgentUiEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private startScript(run: FakeRun): void {
    const startedAt = Date.now()
    this.emitRun(run, { type: 'run.started', startedAt })
    this.emitRun(run, {
      type: 'user.message.created',
      message: {
        id: `user-${run.id}`,
        role: 'user',
        content: run.prompt,
        createdAt: startedAt + 1,
      },
    })
    this.schedule(run, 1, {
      type: 'action.summary',
      message: {
        id: `action-${run.id}`,
        role: 'action',
        content: 'Reading the current chart context',
        createdAt: startedAt + 2,
      },
    })

    const destructive = /clear|delete all/i.test(run.prompt)
    const mutation = !run.readOnly && /add|switch|dark|move|clear|delete/i.test(run.prompt)
    const failing = /fail|error|unavailable/i.test(run.prompt)
    const tool = this.createTool(run, mutation, destructive)
    run.tool = tool

    this.schedule(run, 2, { type: 'tool.started', call: tool })
    this.schedule(run, 3, {
      type: 'tool.progress',
      toolCallId: tool.id,
      progress: { label: 'Validating chart context', current: 1, total: 2 },
    })

    if (destructive) {
      const request: ConfirmationView = {
        id: `confirm-${run.id}`,
        toolCallId: tool.id,
        title: 'Clear all drawings?',
        description: 'This removes every drawing object from the active chart.',
        impact: '4 drawing objects in the current chart',
        reversible: true,
        expiresAt: Date.now() + 30_000,
        status: 'pending',
      }
      this.confirmations.set(request.id, { runId: run.id, request })
      this.schedule(run, 4, { type: 'tool.confirmation.required', request })
      return
    }

    if (failing) {
      this.schedule(run, 4, {
        type: 'tool.finished',
        result: {
          ...tool,
          status: 'failed',
          finishedAt: Date.now(),
          durationMs: 214,
          error: {
            code: 'PROVIDER_ERROR',
            message: 'The scripted provider is temporarily unavailable.',
            retryable: true,
            recommendedAction: 'Retry this run.',
          },
        },
      })
      this.schedule(run, 5, {
        type: 'run.failed',
        endedAt: Date.now(),
        error: {
          code: 'PROVIDER_ERROR',
          message: 'The scripted provider is temporarily unavailable.',
          retryable: true,
          recommendedAction: 'Retry this run.',
        },
      })
      return
    }

    this.scheduleCallback(run, 4, () => {
      run.hasMutation = mutation
      this.emitRun(run, {
        type: 'tool.finished',
        result: {
          ...tool,
          status: 'succeeded',
          resultSummary: mutation ? 'Chart state changed and verified.' : '20 RSI values returned.',
          finishedAt: Date.now(),
          durationMs: 186,
          undoToken: mutation ? `undo-${run.id}` : undefined,
          evidence: {
            symbol: 'BTCUSDT',
            period: '1h',
            source: 'Binance fixture',
            timezone: 'UTC',
            range: 'Latest 20 bars',
            returned: 20,
          },
        },
      })
    })
    this.scheduleCallback(run, 5, () => {
      this.finishRun(
        run,
        mutation
          ? 'The requested chart update is complete and its postcondition was verified.'
          : 'RSI(14) is neutral across the latest 20 bars. The conclusion uses the displayed evidence.',
      )
    })
  }

  private createTool(run: FakeRun, mutation: boolean, destructive: boolean): ToolCallView {
    return {
      id: `tool-${run.id}`,
      runId: run.id,
      name: destructive ? 'drawing.clear' : mutation ? 'indicators.add' : 'indicators_query',
      label: destructive ? 'Clear drawings' : mutation ? 'Update chart' : 'Query RSI(14)',
      status: 'running',
      inputSummary: destructive
        ? 'All drawings on active chart'
        : mutation
          ? 'Apply requested chart change'
          : 'RSI(14), latest 20 bars',
      safety: destructive ? 'destructive' : mutation ? 'reversible-write' : 'read-only',
      reversible: mutation,
      startedAt: Date.now(),
    }
  }

  private finishRun(run: FakeRun, answer: string): void {
    const messageId = `assistant-${run.id}`
    this.emitRun(run, {
      type: 'assistant.message.started',
      messageId,
      createdAt: Date.now(),
    })
    const chunks = answer.match(/.{1,18}(?:\s|$)/g) ?? [answer]
    chunks.forEach((delta, index) => {
      this.schedule(run, index + 1, { type: 'assistant.text.delta', messageId, delta })
    })
    this.schedule(run, chunks.length + 1, { type: 'assistant.message.completed', messageId })
    this.schedule(run, chunks.length + 2, {
      type: 'run.completed',
      endedAt: Date.now(),
      usage: { inputTokens: 148, outputTokens: 72, durationMs: 824, costUsd: 0.0014 },
    })
  }

  private schedule(run: FakeRun, step: number, payload: AgentRunUiEventInput): void {
    this.scheduleCallback(run, step, () => this.emitRun(run, payload))
  }

  private scheduleCallback(run: FakeRun, step: number, callback: () => void): void {
    const timer = setTimeout(() => {
      run.timers.delete(timer)
      callback()
    }, step * this.stepDelayMs)
    run.timers.add(timer)
  }

  private clearTimers(run: FakeRun): void {
    for (const timer of run.timers) clearTimeout(timer)
    run.timers.clear()
  }

  private emitRun(run: FakeRun, payload: AgentRunUiEventInput): void {
    this.emit({ ...payload, runId: run.id, sessionId: run.sessionId } as AgentUiEventInput)
  }

  private emit(event: AgentUiEventInput): void {
    const normalized = { protocolVersion: AGENT_UI_PROTOCOL_VERSION, ...event } as AgentUiEvent
    for (const listener of this.listeners) listener(normalized)
  }
}
