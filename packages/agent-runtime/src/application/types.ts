import type {
  AgentRunUiEventInput,
  AgentSessionSnapshot,
  AgentSessionView,
  AgentUiEvent,
  ProviderStatusView,
  ProviderTestInput,
  ProviderTestResult,
  StartRunInput,
} from '../contracts/ui.js'
import type { PiRunDriver } from '../pi/pi-run-driver.js'
import type { PiRunPlan, PiRunResult } from '../pi/types.js'
import type { RunPersistenceContext } from '../sessions/types.js'

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

export interface RunDriver {
  run(plan: PiRunPlan, emit: (event: AgentRunUiEventInput) => Promise<void>): Promise<PiRunResult>
  abort(): void
  waitForIdle(): Promise<void>
}

export interface AgentApplicationServiceOptions {
  sessions: import('../sessions/runtime-session-service.js').RuntimeSessionService
  createDriver?: () => RunDriver
  createPlan(context: RunPersistenceContext): Promise<PiRunPlan> | PiRunPlan
  provider?: {
    getStatus(): Promise<ProviderStatusView> | ProviderStatusView
    test(input: ProviderTestInput): Promise<ProviderTestResult>
    deleteCredential(): Promise<void>
  }
  now?: () => number
  id?: () => string
  logger?: RuntimeLogSink
}

export interface AgentApplicationApi {
  listSessions(): Promise<AgentSessionView[]>
  openSession(sessionId: string): Promise<AgentSessionSnapshot>
  getProviderStatus(): Promise<ProviderStatusView>
  createSession(): Promise<AgentSessionView>
  renameSession(sessionId: string, title: string): Promise<void>
  deleteSession(sessionId: string): Promise<void>
  startRun(input: StartRunInput): Promise<{ runId: string }>
  cancelRun(runId: string): Promise<void>
  retryRun(runId: string): Promise<{ runId: string }>
  confirmTool(confirmationId: string, decision: 'confirmed' | 'rejected'): Promise<void>
  undoTurn(runId: string): Promise<void>
  testProvider(input: ProviderTestInput): Promise<ProviderTestResult>
  deleteProviderCredential(): Promise<void>
  subscribe(listener: (event: AgentUiEvent) => void): () => void
}

export type { PiRunDriver }
