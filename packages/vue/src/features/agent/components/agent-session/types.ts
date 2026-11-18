/** 会话域的类型契约：行模式沿用共享可编辑行，抽屉维护唯一编辑目标。 */
import type { AgentListRowMode } from '../agent-row/types.js'

/** 抽屉统一维护编辑目标，保证只出现一个行内编辑区域。 */
export type AgentSessionInteraction = {
  sessionId: string
  mode: Exclude<AgentListRowMode, 'idle'>
} | null
