import type {
  AgentBridgeClient,
  AgentSessionSnapshot,
  AgentSessionView,
  AgentUiEvent,
  ProviderStatusView,
  ProviderTestInput,
  ProviderTestResult,
  StartRunInput,
} from '@363045841yyt/klinechart-agent-runtime/contracts/ui'

/** Renderer adapter with no knowledge of IPC channels or Electron primitives. */
export class NativeAgentBridgeClient implements AgentBridgeClient {
  constructor(private readonly native: AgentBridgeClient) {}

  listSessions(): Promise<AgentSessionView[]> {
    return this.native.listSessions()
  }
  openSession(sessionId: string): Promise<AgentSessionSnapshot> {
    return this.native.openSession(sessionId)
  }
  getProviderStatus(): Promise<ProviderStatusView> {
    return this.native.getProviderStatus()
  }
  createSession(): Promise<AgentSessionView> {
    return this.native.createSession()
  }
  renameSession(sessionId: string, title: string): Promise<void> {
    return this.native.renameSession(sessionId, title)
  }
  deleteSession(sessionId: string): Promise<void> {
    return this.native.deleteSession(sessionId)
  }
  startRun(input: StartRunInput): Promise<{ runId: string }> {
    return this.native.startRun(input)
  }
  cancelRun(runId: string): Promise<void> {
    return this.native.cancelRun(runId)
  }
  retryRun(runId: string): Promise<{ runId: string }> {
    return this.native.retryRun(runId)
  }
  confirmTool(confirmationId: string, decision: 'confirmed' | 'rejected'): Promise<void> {
    return this.native.confirmTool(confirmationId, decision)
  }
  undoTurn(runId: string): Promise<void> {
    return this.native.undoTurn(runId)
  }
  testProvider(input: ProviderTestInput): Promise<ProviderTestResult> {
    return this.native.testProvider(input)
  }
  deleteProviderCredential(): Promise<void> {
    return this.native.deleteProviderCredential()
  }
  subscribe(listener: (event: AgentUiEvent) => void): () => void {
    return this.native.subscribe(listener)
  }
}
