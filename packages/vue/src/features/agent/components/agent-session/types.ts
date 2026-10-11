/** 会话行的展示模式及互斥编辑目标。 */
export type AgentSessionRowMode = 'idle' | 'rename' | 'delete'

/** 抽屉统一维护编辑目标，保证只出现一个行内编辑区域。 */
export type AgentSessionInteraction = {
  sessionId: string
  mode: Exclude<AgentSessionRowMode, 'idle'>
} | null
