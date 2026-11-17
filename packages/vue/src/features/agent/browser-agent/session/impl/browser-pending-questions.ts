// 挂起提问表：只保存待答 Promise 的结算入口，不保存会话事实。
import { generateUUID } from '@363045841yyt/klinechart-core'
import type { PendingQuestion } from '../types.js'

export class BrowserPendingQuestions {
  private readonly questions = new Map<string, PendingQuestion>()

  /** 生成跨刷新不重复的提问 ID。 */
  nextId(): string {
    return generateUUID()
  }

  /** 保存挂起中的提问。 */
  add(id: string, question: PendingQuestion): void {
    this.questions.set(id, question)
  }

  /** 查询挂起中的提问。 */
  find(id: string): PendingQuestion | undefined {
    return this.questions.get(id)
  }

  /** 清除已结算提问。 */
  remove(id: string): void {
    this.questions.delete(id)
  }
}
