// Agent 会话层契约：宿主提问的登记输入与广播入口。

import type { AgentWorkspaceEventInput, QuestionOptionView } from '../../agent-contracts.js'

/** 一次待答提问的登记输入。 */
export interface PendingQuestionInput {
  readonly sessionId: string
  readonly toolCallId: string
  readonly prompt: string
  readonly options: readonly QuestionOptionView[]
  readonly multiSelect: boolean
  /** 运行中止信号；中止时按取消结算，工具侧再抛 ABORTED。 */
  readonly signal: AbortSignal
}

/** 事件广播入口；由 Bridge 注入，提问表不直接持有 Bridge。 */
export type PendingQuestionEmit = (event: AgentWorkspaceEventInput) => void
