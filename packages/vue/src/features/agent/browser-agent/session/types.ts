// Agent 会话层契约：宿主提问的挂起状态与应答入口。

import type { QuestionAnswerView } from '../../agent-contracts.js'

/** 一次工具等待用户答复的提问；signal 终止路径由发起方负责收尾。 */
export interface PendingQuestion {
  sessionId: string
  resolve(answer: QuestionAnswerView): void
}
