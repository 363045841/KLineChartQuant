import type { EntryId } from '@earendil-works/pi-durable'
import type {
  AgentRunContext,
  AgentRunMode,
  AgentSessionView,
  AgentTranscriptView,
  AgentWorkspaceEvent,
  ProviderModelsInput,
  ProviderModelsResult,
  ProviderStatusView,
  ProviderTestInput,
  ProviderTestResult,
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

/** 生成运行计划所需的宿主输入；运行标识由会话服务分配。 */
export interface RunPlanInput {
  sessionId: string
  prompt: string
  mode: AgentRunMode
  context?: AgentRunContext
}

/** Provider 相关的附加能力，由宿主注入。 */
export interface ProviderApi {
  getStatus(): Promise<ProviderStatusView> | ProviderStatusView
  listModels(input: ProviderModelsInput): Promise<ProviderModelsResult>
  test(input: ProviderTestInput): Promise<ProviderTestResult>
  deleteCredential(): Promise<void>
}

export interface AgentApplicationServiceOptions {
  sessions: AgentSessionService
  createPlan(input: RunPlanInput): Promise<AgentRunPlan> | AgentRunPlan
  provider?: ProviderApi
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
  editMessage(input: {
    sessionId: string
    entryId: EntryId
    prompt: string
    mode: AgentRunMode
    context?: AgentRunContext
  }): Promise<{ runId: string; sessionId: string }>
  getProviderStatus(): Promise<ProviderStatusView>
  listProviderModels(input: ProviderModelsInput): Promise<ProviderModelsResult>
  testProvider(input: ProviderTestInput): Promise<ProviderTestResult>
  deleteProviderCredential(): Promise<void>
  subscribe(listener: (event: AgentWorkspaceEvent) => void): () => void
}
