// 浏览器会话集合：维护会话视图、最近运行输入，并支持按 runId 反查所属会话。

import { AgentRuntimeError } from '@363045841yyt/klinechart-agent-runtime'
import type { AgentSessionView, StartRunInput } from '../../../agent-contracts.js'
import type { BrowserSession } from '../types.js'

/** 浏览器端会话集合；默认持有一个空会话，重试输入随会话删除一并清除。 */
export class BrowserSessionStore {
  private readonly sessions = new Map<string, BrowserSession>()
  private readonly runInputs = new Map<string, StartRunInput>()
  private nextSession = 1

  constructor() {
    this.create()
  }

  /** 返回全部会话视图。 */
  list(): AgentSessionView[] {
    return [...this.sessions.values()].map(({ view }) => view)
  }

  /** 新建会话并加入集合。 */
  create(): BrowserSession {
    const id = `session-${this.nextSession++}`
    const session: BrowserSession = {
      view: { id, title: 'New analysis', updatedAt: Date.now() },
      messages: [],
      runs: [],
      transcript: [],
    }
    this.sessions.set(id, session)
    return session
  }

  /** 按 id 取会话，不存在时抛 SESSION_NOT_FOUND。 */
  require(sessionId: string): BrowserSession {
    const session = this.sessions.get(sessionId)
    if (!session)
      throw new AgentRuntimeError('SESSION_NOT_FOUND', 'The Agent session was not found.')
    return session
  }

  /** 重命名会话并刷新更新时间。 */
  rename(sessionId: string, title: string): void {
    const session = this.require(sessionId)
    session.view = { ...session.view, title, updatedAt: Date.now() }
  }

  /** 删除会话及其最近运行输入。 */
  delete(sessionId: string): void {
    this.sessions.delete(sessionId)
    this.runInputs.delete(sessionId)
  }

  /** 记录会话最近一次运行的输入，供重试恢复。 */
  rememberRunInput(sessionId: string, input: StartRunInput): void {
    this.runInputs.set(sessionId, input)
  }

  /** 返回会话最近一次运行的输入。 */
  runInput(sessionId: string): StartRunInput | undefined {
    return this.runInputs.get(sessionId)
  }

  /** 按 runId 反查所属会话，供重试恢复该会话最近一次运行的输入。 */
  findSessionByRun(runId: string): BrowserSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.runs.some((run) => run.id === runId)) return session
    }
    return undefined
  }
}
