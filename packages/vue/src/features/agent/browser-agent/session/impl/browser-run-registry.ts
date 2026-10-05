// 本文件仅保存浏览器当前运行计数与等待用户回答的提问，历史由 pi-durable 管理。
import type { PendingQuestion } from '../types.js'

export class BrowserRunRegistry {
  private readonly activeRuns = new Set<string>()
  private readonly pendingQuestions = new Map<string, PendingQuestion>()
  /** 当前活动运行数，供 Provider 设置守卫使用。 */
  get activeCount(): number {
    return this.activeRuns.size
  }
  /** 记录一次运行开始。 */
  register(runId: string): void {
    this.activeRuns.add(runId)
  }
  /** 记录一次运行结束。 */
  complete(runId: string): void {
    this.activeRuns.delete(runId)
  }
  /** 生成跨刷新不重复的提问 ID。 */
  nextQuestionId(): string {
    return globalThis.crypto.randomUUID()
  }
  /** 保存挂起中的提问。 */
  addQuestion(id: string, question: PendingQuestion): void {
    this.pendingQuestions.set(id, question)
  }
  /** 查询挂起中的提问。 */
  findQuestion(id: string): PendingQuestion | undefined {
    return this.pendingQuestions.get(id)
  }
  /** 清除已结算提问。 */
  removeQuestion(id: string): void {
    this.pendingQuestions.delete(id)
  }
}
