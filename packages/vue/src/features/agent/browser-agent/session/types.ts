// 浏览器会话与运行生命周期的状态契约；状态容器实现位于 impl/。

import type { QuestionAnswerView } from '../../agent-contracts.js'

/** 一次挂起等待用户答复的提问；signal 中止路径由发起方自行收尾。 */
export interface PendingQuestion {
  runId: string
  sessionId: string
  resolve(answer: QuestionAnswerView): void
}
