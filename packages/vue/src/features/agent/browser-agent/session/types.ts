// 浏览器会话与运行生命周期的状态契约；状态容器实现位于 impl/。

import type { PiRunDriver, PiRunPlan } from '@363045841yyt/klinechart-agent-runtime'
import type {
  AgentSessionSnapshot,
  AgentSessionView,
  QuestionAnswerView,
  StartRunInput,
} from '../../agent-contracts.js'

/** 浏览器端会话记录：视图、消息、运行与 Pi transcript；运行期间被原地追加。 */
export interface BrowserSession {
  view: AgentSessionView
  messages: AgentSessionSnapshot['messages']
  runs: AgentSessionSnapshot['runs']
  transcript: Array<NonNullable<PiRunPlan['transcript']>[number]>
}

/** 一次进行中的运行：驱动与冻结后的输入。 */
export interface ActiveRun {
  driver: PiRunDriver
  input: StartRunInput
}

/** 一次挂起等待用户答复的提问；signal 中止路径由发起方自行收尾。 */
export interface PendingQuestion {
  runId: string
  sessionId: string
  resolve(answer: QuestionAnswerView): void
}
