// Agent 工作区 UI 状态：会话目录、当前会话读取结果与宿主提问。

import type {
  AgentErrorView,
  AgentRunMode,
  AgentSessionView,
  AgentTranscriptView,
  QuestionView,
} from '../agent-contracts.js'

/** Renderer 持有的 Agent 工作区状态；会话内容只保存官方读取结果。 */
export interface AgentWorkspaceState {
  sessions: AgentSessionView[]
  activeSessionId: string | null
  transcript: AgentTranscriptView | null
  questions: QuestionView[]
}

/** Agent 工作区的运行时可用性，与单次运行错误相互独立。 */
export type AgentWorkspaceAvailability =
  | { readonly status: 'initializing' }
  | { readonly status: 'ready' }
  | { readonly status: 'unavailable'; readonly error: AgentErrorView }

/** Agent 工作区的用户偏好。 */
export interface AgentWorkspacePreferences {
  readonly locale: 'en' | 'zh-CN'
  readonly mode: AgentRunMode
  readonly collapseReasoning: boolean
}
