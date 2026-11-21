import type { EntryId } from '@earendil-works/pi-durable'
import type {
  AgentRunContext,
  AgentRunMode,
  AgentSessionView,
  AgentTranscriptView,
  AgentWorkspaceEvent,
  ContinueRunInput,
  StartRunInput,
} from '../contracts/ui.js'
import type { AgentRunPlan } from '../pi/types.js'
import type { AgentSessionService } from '../sessions/session-service.js'

export interface RuntimeLogRecord {
  level: 'debug' | 'info' | 'warn' | 'error'
  event: string
  sessionId?: string
  runId?: string
  durationMs?: number
  fields?: Readonly<Record<string, unknown>>
}

export interface RuntimeLogSink {
  write(record: RuntimeLogRecord): void
}

/** 构造运行计划所需的宿主输入；运行标识由会话服务分配，continue 不携带正文。 */
export interface RunPlanInput {
  sessionId: string
  prompt?: string
  mode: AgentRunMode
  context?: AgentRunContext
}

/** 运行支持：只负责把一次输入构造成模型计划。 */
export interface RuntimeSupport {
  createPlan(input: RunPlanInput): Promise<AgentRunPlan> | AgentRunPlan
}

export interface AgentApplicationServiceOptions {
  sessions: AgentSessionService
  createPlan(input: RunPlanInput): Promise<AgentRunPlan> | AgentRunPlan
  now?: () => number
  logger?: RuntimeLogSink
}

export interface AgentApplicationApi {
  listSessions(): Promise<AgentSessionView[]>
  openSession(sessionId: string): Promise<AgentTranscriptView>
  loadEarlier(sessionId: string): Promise<AgentTranscriptView>
  createSession(): Promise<AgentSessionView>
  renameSession(sessionId: string, title: string): Promise<void>
  deleteSession(sessionId: string): Promise<void>
  startRun(input: StartRunInput): Promise<{ runId: string; sessionId: string }>
  cancelRun(sessionId: string): Promise<void>
  retryRun(input: {
    sessionId: string
    entryId: EntryId
    mode: AgentRunMode
    context?: AgentRunContext
  }): Promise<{ runId: string; sessionId: string }>
  continueRun(input: ContinueRunInput): Promise<{ runId: string; sessionId: string }>
  editMessage(input: {
    sessionId: string
    entryId: EntryId
    prompt: string
    mode: AgentRunMode
    context?: AgentRunContext
  }): Promise<{ runId: string; sessionId: string }>
  subscribe(listener: (event: AgentWorkspaceEvent) => void): () => void
}
