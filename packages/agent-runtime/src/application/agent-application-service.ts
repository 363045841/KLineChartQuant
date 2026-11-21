// 应用服务：把官方会话视图转成 UI 读取结果，并转发运行与目录命令。
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import {
  type Conversation,
  ConversationTranscript,
  type EntryId,
  type TranscriptItem,
  type TranscriptView,
} from '@earendil-works/pi-durable'
import { AgentRuntimeError, toAgentRuntimeError } from '../contracts/errors.js'
import {
  AGENT_UI_PROTOCOL_VERSION,
  type AgentRunMode,
  type AgentSessionView,
  type AgentTranscriptView,
  type AgentWorkspaceEvent,
  type ContinueRunInput,
  type EditMessageInput,
  type StartRunInput,
} from '../contracts/ui.js'
import type { AgentApplicationApi, AgentApplicationServiceOptions, RunPlanInput } from './types.js'

/** 每个已打开会话持有的官方对象：会话句柄、客户端条目流、最新读取结果与订阅。 */
interface OpenSession {
  conversation: Conversation
  transcript: ConversationTranscript
  view: TranscriptView
  title: string
  stop: () => Promise<void>
}

/**
 * 把官方客户端视图与标题组合成 UI 读取结果。
 * @param view 官方 ConversationTranscript 输出。
 * @param title 会话标题。
 * @returns UI 渲染所需视图。
 */
function toTranscriptView(view: TranscriptView, title: string): AgentTranscriptView {
  return { conversation: view.conversation, items: view.items, docs: view.docs, title }
}

export class AgentApplicationService implements AgentApplicationApi {
  private readonly listeners = new Set<(event: AgentWorkspaceEvent) => void>()
  private readonly open = new Map<string, OpenSession>()

  constructor(private readonly options: AgentApplicationServiceOptions) {}

  /** 列出会话目录。 */
  listSessions(): Promise<AgentSessionView[]> {
    return this.options.sessions.list()
  }

  /** 创建会话并广播新的目录。 */
  async createSession(): Promise<AgentSessionView> {
    const session = await this.options.sessions.create('')
    await this.publishSessions()
    return session
  }

  /** 重命名会话并广播新的目录。 */
  async renameSession(sessionId: string, title: string): Promise<void> {
    await this.options.sessions.rename(sessionId, title)
    await this.publishSessions()
  }

  /** 删除会话；若正在展示则先关闭本地订阅。 */
  async deleteSession(sessionId: string): Promise<void> {
    await this.closeSession(sessionId)
    await this.options.sessions.delete(sessionId)
    await this.publishSessions()
  }

  /**
   * 打开会话并返回当前完整读取结果。
   *
   * 会话订阅归打开它的观察者所有：打开别的会话不会关闭这里的订阅，否则一个窗口
   * 切换会话就会把另一个窗口正在看的对话从视图里踢掉。
   * @param sessionId 会话标识。
   */
  async openSession(sessionId: string): Promise<AgentTranscriptView> {
    if (this.open.has(sessionId)) return this.currentView(sessionId)
    const handle = await this.options.sessions.watch(sessionId, (view, title) => {
      const open = this.open.get(sessionId)
      if (!open) return
      open.title = title
      open.view = open.transcript.merge(view)
      this.publish({
        protocolVersion: AGENT_UI_PROTOCOL_VERSION,
        type: 'session.changed',
        sessionId,
        transcript: toTranscriptView(open.view, open.title),
      })
    })
    const transcript = new ConversationTranscript((query, limit) =>
      this.options.sessions.entries(sessionId, query, limit),
    )
    this.open.set(sessionId, {
      conversation: handle.conversation,
      transcript,
      view: transcript.merge(handle.view),
      title: handle.title,
      stop: handle.stop,
    })
    return this.currentView(sessionId)
  }

  /** 加载更早的一页条目。 */
  async loadEarlier(sessionId: string): Promise<AgentTranscriptView> {
    return this.step(sessionId, (transcript) => transcript.loadEarlier(BACKGROUND_CONTEXT))
  }

  /**
   * 补齐条目流中的缺失区间。
   * @param sessionId 会话标识。
   * @param after 缺失区间起点。
   * @param upTo 缺失区间终点。
   */
  async fillGap(sessionId: string, after: EntryId, upTo: EntryId): Promise<AgentTranscriptView> {
    return this.step(sessionId, async (transcript, open) => {
      const gap = open.view.items.find(
        (item): item is Extract<TranscriptItem, { kind: 'gap' }> =>
          item.kind === 'gap' && item.after === after && item.upTo === upTo,
      )
      return gap ? transcript.fillGap(gap, BACKGROUND_CONTEXT) : open.view
    })
  }

  /** 提交一次运行。 */
  async startRun(input: StartRunInput): Promise<{ runId: string; sessionId: string }> {
    const plan = await this.createPlan({
      sessionId: input.sessionId,
      prompt: input.prompt,
      mode: input.mode,
      context: input.context,
    })
    const started = await this.options.sessions.startRun(input.sessionId, input.prompt, plan)
    await this.publishSessions()
    return { runId: started.runId, sessionId: input.sessionId }
  }

  /**
   * 继续运行：官方 continue 不追加用户消息，只让模型回答仍然欠着答案的上下文。
   * @param input 会话、权限模式与界面上下文。
   * @returns 运行标识与会话标识（continue 不切换分支）。
   */
  async continueRun(input: ContinueRunInput): Promise<{ runId: string; sessionId: string }> {
    const plan = await this.createPlan({
      sessionId: input.sessionId,
      mode: input.mode,
      context: input.context,
    })
    const started = await this.options.sessions.continue(input.sessionId, plan)
    await this.publishSessions()
    return { runId: started.runId, sessionId: input.sessionId }
  }

  /** 中止会话当前运行。 */
  cancelRun(sessionId: string): Promise<void> {
    return this.options.sessions.cancel(sessionId)
  }

  /** 重新生成：在该用户条目之前的官方边界创建分支并重发原文。 */
  async retryRun(input: {
    sessionId: string
    entryId: EntryId
    mode: AgentRunMode
    context?: StartRunInput['context']
  }): Promise<{ runId: string; sessionId: string }> {
    const prompt = await this.options.sessions.readUserPrompt(input.entryId)
    const plan = await this.createPlan({
      sessionId: input.sessionId,
      prompt,
      mode: input.mode,
      context: input.context,
    })
    const started = await this.options.sessions.retry(input.sessionId, input.entryId, prompt, plan)
    await this.switchSession(started.sessionId)
    return started
  }

  /** 编辑重发：在该用户条目之前的官方边界创建分支并提交新正文。 */
  async editMessage(input: EditMessageInput): Promise<{ runId: string; sessionId: string }> {
    const plan = await this.createPlan({
      sessionId: input.sessionId,
      prompt: input.prompt,
      mode: input.mode,
      context: input.context,
    })
    const started = await this.options.sessions.edit(
      input.sessionId,
      input.entryId,
      input.prompt,
      plan,
    )
    await this.switchSession(started.sessionId)
    return started
  }

  /** 订阅工作区事件。 */
  subscribe(listener: (event: AgentWorkspaceEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 关闭全部本地订阅。 */
  async close(): Promise<void> {
    await this.closeOtherSessions(undefined)
  }

  /** 走一遍客户端条目流合并，并把结果广播给工作区。 */
  private async step(
    sessionId: string,
    change: (transcript: ConversationTranscript, open: OpenSession) => Promise<TranscriptView>,
  ): Promise<AgentTranscriptView> {
    const open = this.open.get(sessionId)
    if (!open) {
      throw new AgentRuntimeError('SESSION_NOT_FOUND', 'The Agent session is not open.')
    }
    open.view = await change(open.transcript, open)
    const view = toTranscriptView(open.view, open.title)
    this.publish({
      protocolVersion: AGENT_UI_PROTOCOL_VERSION,
      type: 'session.changed',
      sessionId,
      transcript: view,
    })
    return view
  }

  /** 读取已打开会话的当前视图。 */
  private currentView(sessionId: string): AgentTranscriptView {
    const open = this.open.get(sessionId)
    if (!open) {
      throw new AgentRuntimeError('SESSION_NOT_FOUND', 'The Agent session is not open.')
    }
    return toTranscriptView(open.view, open.title)
  }

  /** 分支运行后切换到新会话，并广播目录与视图。 */
  private async switchSession(sessionId: string): Promise<void> {
    await this.openSession(sessionId)
    await this.publishSessions()
  }

  /**
   * 关闭一个会话的本地订阅并通知工作区。
   *
   * 由观察者租约的持有者决定何时关闭；会话被删除时也会调用。
   * @param sessionId 会话标识。
   */
  async closeSession(sessionId: string): Promise<void> {
    const open = this.open.get(sessionId)
    if (!open) return
    this.open.delete(sessionId)
    await open.stop()
    this.publish({
      protocolVersion: AGENT_UI_PROTOCOL_VERSION,
      type: 'session.closed',
      sessionId,
    })
  }

  /** 关闭除指定会话外的全部订阅；只有服务整体关闭时使用。 */
  private async closeOtherSessions(keep: string | undefined): Promise<void> {
    for (const sessionId of [...this.open.keys()]) {
      if (sessionId !== keep) await this.closeSession(sessionId)
    }
  }

  /** 生成运行计划。 */
  private createPlan(input: RunPlanInput) {
    return this.options.createPlan(input)
  }

  /** 广播最新会话目录，刷新标题与排序。 */
  private async publishSessions(): Promise<void> {
    this.publish({
      protocolVersion: AGENT_UI_PROTOCOL_VERSION,
      type: 'sessions.changed',
      sessions: await this.options.sessions.list(),
    })
  }

  /** 向所有订阅者发送事件。 */
  private publish(event: AgentWorkspaceEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}
