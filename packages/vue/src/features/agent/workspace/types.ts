// Agent 工作区与会话 UI 状态的数据契约层；reducer、持久化与 composable 实现位于 impl/。

import type {
  AgentErrorView,
  AgentMessageView,
  AgentRunView,
  AgentSessionView,
  ConfirmationView,
  ProviderStatusView,
  QuestionView,
  ToolCallView,
} from '../agent-contracts.js'

/** Renderer 侧的单一 Agent 工作区视图状态，由事件回放与实时事件共同投影得到。 */
export interface AgentWorkspaceState {
  lastSequence: number
  sessions: AgentSessionView[]
  activeSessionId: string | null
  messages: AgentMessageView[]
  toolCalls: ToolCallView[]
  confirmations: ConfirmationView[]
  questions: QuestionView[]
  run: AgentRunView
  previousRuns: AgentRunView[]
  provider: ProviderStatusView
  error: AgentErrorView | null
  canUndoTurn: boolean
  announcement: string
}

/** Agent 面板宽度的持久化读写端口。 */
export interface AgentPanelWidthStorage {
  load(): number | null | undefined
  save(width: number): void
}

/** Agent 工作区的用户偏好。 */
export interface AgentWorkspacePreferences {
  readonly locale: 'en' | 'zh-CN'
  readonly readOnly: boolean
  readonly collapseReasoning: boolean
}
