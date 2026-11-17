// 挂起提问表：一次提问的结算（答复、取消、运行中止）只在这里发生，Bridge 只负责转发调用。
import type { AskUserOutcome } from '@363045841yyt/klinechart-agent-runtime'
import { generateUUID } from '@363045841yyt/klinechart-core'
import type { QuestionAnswerView } from '../../../agent-contracts.js'
import type { PendingQuestionEmit, PendingQuestionInput } from '../types.js'

export class BrowserPendingQuestions {
  /** 提问 id 到唯一结算入口；表里有值即代表尚未结算。 */
  private readonly questions = new Map<string, (outcome: AskUserOutcome) => void>()

  constructor(private readonly emit: PendingQuestionEmit) {}

  /**
   * 登记一次提问并广播 required 事件。
   * @param input 会话、工具调用、提问内容与中止信号。
   * @returns 只结算一次的 Promise；答复、取消与中止都走同一入口。
   */
  open(input: PendingQuestionInput): Promise<AskUserOutcome> {
    const id = generateUUID()
    return new Promise<AskUserOutcome>((resolve) => {
      const settle = (outcome: AskUserOutcome): void => {
        if (!this.questions.delete(id)) return
        input.signal.removeEventListener('abort', abort)
        this.emit({
          type: 'tool.question.resolved',
          sessionId: input.sessionId,
          questionId: id,
          status: outcome.status,
          ...(outcome.status === 'answered' ? { answer: outcome.answer } : {}),
        })
        resolve(outcome)
      }
      // 中止与用户取消同义：都表示这次提问没人作答。
      const abort = (): void => settle({ status: 'cancelled' })

      this.questions.set(id, settle)
      input.signal.addEventListener('abort', abort, { once: true })
      // 信号可能在登记前就已中止：此时不再广播 required，直接按取消结算。
      if (input.signal.aborted) {
        abort()
        return
      }
      this.emit({
        type: 'tool.question.required',
        sessionId: input.sessionId,
        request: {
          id,
          toolCallId: input.toolCallId,
          prompt: input.prompt,
          options: input.options,
          multiSelect: input.multiSelect,
          status: 'pending',
        },
      })
    })
  }

  /** 投递用户答复；未知或已结算的提问忽略。 */
  answer(id: string, answer: QuestionAnswerView): void {
    this.questions.get(id)?.({ status: 'answered', answer })
  }

  /** 用户主动放弃这次提问；未知或已结算的提问忽略。 */
  cancel(id: string): void {
    this.questions.get(id)?.({ status: 'cancelled' })
  }
}
