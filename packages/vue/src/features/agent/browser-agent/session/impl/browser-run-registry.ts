// 运行状态容器：进行中运行与挂起提问的注册、查询、结算及并发计数。

import type { ActiveRun, PendingQuestion } from '../types.js'

/** 浏览器端进行中运行与挂起提问的状态容器；只持有状态，不驱动运行。 */
export class BrowserRunRegistry {
  private readonly activeRuns = new Map<string, ActiveRun>()
  private readonly pendingQuestions = new Map<string, PendingQuestion>()
  private nextRun = 1
  private nextQuestion = 1

  /** 进行中运行数量；供 Provider 与会话变更前的并发守卫。 */
  get activeCount(): number {
    return this.activeRuns.size
  }

  /** 生成下一个运行 ID。 */
  nextRunId(): string {
    return `run-${this.nextRun++}`
  }

  /** 注册一次进行中的运行。 */
  register(runId: string, run: ActiveRun): void {
    this.activeRuns.set(runId, run)
  }

  /** 按 runId 取进行中的运行。 */
  find(runId: string): ActiveRun | undefined {
    return this.activeRuns.get(runId)
  }

  /** 中止指定运行；不存在时忽略。 */
  abort(runId: string): void {
    this.activeRuns.get(runId)?.driver.abort()
  }

  /** 运行结束后移除记录。 */
  complete(runId: string): void {
    this.activeRuns.delete(runId)
  }

  /** 生成下一个提问 ID。 */
  nextQuestionId(): string {
    return `question-${this.nextQuestion++}`
  }

  /** 注册一次挂起等待答复的提问。 */
  addQuestion(id: string, question: PendingQuestion): void {
    this.pendingQuestions.set(id, question)
  }

  /** 按问题 ID 取挂起中的提问。 */
  findQuestion(id: string): PendingQuestion | undefined {
    return this.pendingQuestions.get(id)
  }

  /** 移除已结算的提问。 */
  removeQuestion(id: string): void {
    this.pendingQuestions.delete(id)
  }
}
