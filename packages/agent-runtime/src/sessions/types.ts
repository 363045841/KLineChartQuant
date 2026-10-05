// 应用仅保留会话目录与宿主提交关联，模型消息及工具状态由 Pi 保存。
import type { AgentRunContext } from '../contracts/ui.js'

export const KQ_SESSION_SCHEMA_VERSION = 1 as const
export const KQ_CUSTOM_ENTRY = {
  runStarted: 'kq.run.started',
  runTerminal: 'kq.run.terminal',
  sessionMetadata: 'kq.session.metadata',
} as const

export interface KqSessionMetadataEntry {
  schemaVersion: number
  updatedAt: number
}

export interface KqRunStartedEntry {
  schemaVersion: typeof KQ_SESSION_SCHEMA_VERSION
  runId: string
  turnId: string
  lane: string
  prompt: string
  readOnly: boolean
  context?: AgentRunContext
  userEntryId: string
  startedAt: number
  retryOfRunId?: string
  editOfRunId?: string
}

export interface KqRunTerminalEntry {
  schemaVersion: typeof KQ_SESSION_SCHEMA_VERSION
  runId: string
  status: 'completed' | 'failed' | 'cancelled' | 'partial' | 'interrupted'
  endedAt: number
}

export interface BeginRunInput {
  sessionId: string
  runId: string
  turnId: string
  prompt: string
  readOnly: boolean
  context?: AgentRunContext
  startedAt: number
}

/** 分支来源及新运行标识，运行策略通过可辨识联合声明。 */
interface ForkRunBase {
  sessionId: string
  originalRunId: string
  runId: string
  turnId: string
  startedAt: number
}

export type ForkRunAction = { kind: 'retry' } | { kind: 'edit'; prompt: string }

export type ForkRunInput = ForkRunBase & ForkRunAction

export interface RunPersistenceContext {
  sessionId: string
  runId: string
  turnId: string
  lane: string
  prompt: string
  readOnly: boolean
  context?: AgentRunContext
  userEntryId: string
  startedAt: number
  retryOfRunId?: string
  editOfRunId?: string
}
