// 宿主只管理提交操作、会话目录和 Provider 设置，消息与运行状态来自官方 Conversation。
import { AgentRuntimeError, toAgentRuntimeError } from '../contracts/errors.js'
import {
  AGENT_UI_PROTOCOL_VERSION,
  type AgentWorkspaceEvent,
  type ProviderModelsInput,
  type ProviderStatusView,
  type ProviderTestInput,
  type StartRunInput,
} from '../contracts/ui.js'
import type { DurableRunDriver } from '../pi/impl/durable-run-driver.js'
import type { ForkRunAction, RunPersistenceContext } from '../sessions/types.js'
import type { AgentApplicationApi, AgentApplicationServiceOptions } from './types.js'

interface OwnedSubmission {
  context: RunPersistenceContext
  driver: DurableRunDriver
  cancelled: boolean
  promise: Promise<void>
}

const DEFAULT_PROVIDER_STATUS: ProviderStatusView = {
  state: 'not-configured',
  providerLabel: 'OpenAI-compatible',
  configured: false,
  compatibility: 'unknown',
}

/** 应用服务不消费文本或工具事件，也不保存消息投影。 */
export class AgentApplicationService implements AgentApplicationApi {
  private readonly listeners = new Set<(event: AgentWorkspaceEvent) => void>()
  private readonly owned = new Map<string, OwnedSubmission>()
  private readonly admitting = new Set<string>()
  private readonly now: () => number
  private readonly id: () => string

  constructor(private readonly options: AgentApplicationServiceOptions) {
    this.now = options.now ?? Date.now
    this.id = options.id ?? (() => globalThis.crypto.randomUUID())
  }

  /** 宿主重启时通过官方取消协议结算遗留任务。 */
  async initialize(): Promise<string[]> {
    return this.options.sessions.recoverInterrupted()
  }

  /** 关闭本宿主提交的工作。 */
  async close(): Promise<void> {
    await this.interruptOwnedRuns()
  }

  listSessions() {
    return this.options.sessions.list()
  }
  openSession(sessionId: string) {
    return this.options.sessions.open(sessionId)
  }
  async getProviderStatus() {
    return (await this.options.provider?.getStatus()) ?? DEFAULT_PROVIDER_STATUS
  }

  async createSession() {
    const session = await this.options.sessions.create()
    await this.publishSessions()
    return session
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    await this.options.sessions.rename(sessionId, title)
    await this.publishSessions()
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.admit(sessionId, () => this.options.sessions.delete(sessionId))
    await this.publishSessions()
  }

  /** 拒绝仍在执行的提交；官方已结算时等待宿主清理完成。 */
  private async assertAvailable(sessionId: string): Promise<void> {
    const owned = [...this.owned.values()].find((item) => item.context.sessionId === sessionId)
    if (!owned) return
    const run = (await this.openSession(sessionId)).runs.find(
      (item) => item.id === owned.context.runId,
    )
    if (run && !['running', 'cancelling'].includes(run.status)) {
      await owned.promise
      return
    }
    throw new AgentRuntimeError('RUN_ACTIVE', 'Only one Agent run may be active in a session.')
  }

  async startRun(input: StartRunInput): Promise<{ runId: string }> {
    return this.admit(input.sessionId, async () => {
      const context = await this.options.sessions.beginRun({
        ...input,
        runId: this.id(),
        turnId: this.id(),
        startedAt: this.now(),
      })
      return this.launch(context)
    })
  }

  async retryRun(runId: string): Promise<{ runId: string }> {
    return this.forkRun(runId, { kind: 'retry' })
  }

  /** 修改历史用户输入，沿原输入之前的分支边界重新执行。 */
  async editMessage(runId: string, prompt: string): Promise<{ runId: string }> {
    const content = prompt.trim()
    if (!content) throw new AgentRuntimeError('INVALID_PAYLOAD', 'The edited message is empty.')
    return this.forkRun(runId, { kind: 'edit', prompt: content })
  }

  /** 重新生成和编辑共享准备互斥、官方 Fork 与提交生命周期。 */
  private async forkRun(runId: string, action: ForkRunAction): Promise<{ runId: string }> {
    const original = await this.options.sessions.findRun(runId)
    return this.admit(original.sessionId, async () => {
      const context = await this.options.sessions.forkRun({
        sessionId: original.sessionId,
        originalRunId: runId,
        runId: this.id(),
        turnId: this.id(),
        startedAt: this.now(),
        ...action,
      })
      return this.launch(context)
    })
  }

  /** 只串行化宿主的准备阶段，避免两次提交在官方任务创建前交叉写入运行关联。 */
  private async admit<T>(sessionId: string, action: () => Promise<T>): Promise<T> {
    if (this.admitting.has(sessionId))
      throw new AgentRuntimeError('RUN_ACTIVE', 'A submission is already being prepared.')
    this.admitting.add(sessionId)
    try {
      await this.assertAvailable(sessionId)
      return await action()
    } finally {
      this.admitting.delete(sessionId)
    }
  }

  async cancelRun(runId: string): Promise<void> {
    const owned = this.owned.get(runId)
    if (!owned) throw new AgentRuntimeError('RUN_NOT_ACTIVE', 'The Agent run is not active.')
    owned.cancelled = true
    owned.driver.abort()
    await owned.promise
  }

  /** 官方任务记录负责状态；这个 Map 仅用于关闭时等待宿主提交操作。 */
  async interruptOwnedRuns(): Promise<void> {
    const owned = [...this.owned.values()]
    for (const item of owned) {
      item.cancelled = true
      item.driver.abort()
    }
    await Promise.allSettled(owned.map((item) => item.promise))
  }

  private launch(context: RunPersistenceContext): { runId: string } {
    const owned: OwnedSubmission = {
      context,
      driver: this.options.sessions.createDriver(),
      cancelled: false,
      promise: Promise.resolve(),
    }
    this.owned.set(context.runId, owned)
    owned.promise = this.execute(owned)
    void owned.promise.catch((error: unknown) => {
      this.options.logger?.write({
        level: 'error',
        event: 'agent.submission.failed',
        sessionId: context.sessionId,
        runId: context.runId,
        fields: { message: toAgentRuntimeError(error).message },
      })
    })
    return { runId: context.runId }
  }

  /** 原样订阅官方完整状态，配置失败才由宿主补充终态错误。 */
  private async execute(owned: OwnedSubmission): Promise<void> {
    const { context } = owned
    let stop: (() => Promise<void>) | undefined
    try {
      stop = await this.options.sessions.watchSession(context.sessionId, (snapshot) =>
        this.publish({
          protocolVersion: AGENT_UI_PROTOCOL_VERSION,
          type: 'session.snapshot',
          snapshot,
        }),
      )
      if (owned.cancelled) throw new AgentRuntimeError('ABORTED', 'The Agent run was cancelled.')
      const plan = await this.options.createPlan(context)
      if (owned.cancelled) throw new AgentRuntimeError('ABORTED', 'The Agent run was cancelled.')
      await owned.driver.run(plan)
      await this.options.sessions.finishRun(context, { status: 'completed', endedAt: this.now() })
      this.options.logger?.write({
        level: 'info',
        event: 'agent.run.completed',
        sessionId: context.sessionId,
        runId: context.runId,
        durationMs: this.now() - context.startedAt,
      })
    } catch (thrown) {
      const error = toAgentRuntimeError(thrown)
      await this.options.sessions.finishRun(
        context,
        { status: error.code === 'ABORTED' ? 'cancelled' : 'failed', endedAt: this.now() },
        { error: error.toView() },
      )
    } finally {
      try {
        await stop?.()
        const snapshot = await this.openSession(context.sessionId)
        this.publish({
          protocolVersion: AGENT_UI_PROTOCOL_VERSION,
          type: 'session.snapshot',
          snapshot,
        })
      } finally {
        this.owned.delete(context.runId)
      }
    }
  }

  async confirmTool(): Promise<void> {
    throw new AgentRuntimeError('RUN_NOT_ACTIVE', 'No tool confirmation is pending.')
  }
  async undoTurn(): Promise<void> {
    throw new AgentRuntimeError('RUN_NOT_ACTIVE', 'No reversible tool result is available.')
  }

  async testProvider(input: ProviderTestInput) {
    const provider = this.options.provider
    if (!provider)
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'No Agent Provider adapter is installed.',
      )
    this.publish({
      protocolVersion: AGENT_UI_PROTOCOL_VERSION,
      type: 'provider.status.changed',
      status: {
        ...(await this.getProviderStatus()),
        state: 'testing',
        compatibility: 'testing',
        error: undefined,
      },
    })
    try {
      return await provider.test(input)
    } finally {
      await this.publishProvider()
    }
  }

  async listProviderModels(input: ProviderModelsInput) {
    const provider = this.options.provider
    if (!provider)
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'No Agent Provider adapter is installed.',
      )
    try {
      return await provider.listModels(input)
    } finally {
      await this.publishProvider()
    }
  }

  async deleteProviderCredential(): Promise<void> {
    await this.options.provider?.deleteCredential()
    await this.publishProvider()
  }

  subscribe(listener: (event: AgentWorkspaceEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private publish(event: AgentWorkspaceEvent): void {
    for (const listener of this.listeners) listener(event)
  }
  private async publishSessions(): Promise<void> {
    this.publish({
      protocolVersion: AGENT_UI_PROTOCOL_VERSION,
      type: 'sessions.changed',
      sessions: await this.listSessions(),
    })
  }
  private async publishProvider(): Promise<void> {
    this.publish({
      protocolVersion: AGENT_UI_PROTOCOL_VERSION,
      type: 'provider.status.changed',
      status: await this.getProviderStatus(),
    })
  }
}
