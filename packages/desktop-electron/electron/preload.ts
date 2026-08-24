import {
  AGENT_IPC_PAYLOAD_VERSION,
  AGENT_IPC_PROTOCOL_VERSION,
} from '@363045841yyt/klinechart-agent-runtime'
import { contextBridge, ipcRenderer } from 'electron'

import {
  AGENT_CHART_ID,
  AGENT_COMMAND_CHANNEL,
  AGENT_CONNECT_CHANNEL,
  AGENT_IDENTITY_CHANNEL,
  AGENT_PORT_CHANNEL,
} from './agent-ipc-channels'

import type {
  AgentBridgeClient,
  AgentIpcRequest,
  AgentSessionView,
  AgentSessionSnapshot,
  AgentUiEvent,
  ProviderModelsInput,
  ProviderModelsResult,
  ProviderStatusView,
  ProviderTestInput,
  ProviderTestResult,
  StartRunInput,
} from '@363045841yyt/klinechart-agent-runtime'

interface AgentIdentity {
  windowId: string
  chartId: typeof AGENT_CHART_ID
}

type AgentCommand = AgentIpcRequest['command']
type AgentPayload<Command extends AgentCommand> = Extract<
  AgentIpcRequest,
  { command: Command }
>['payload']

const identity = ipcRenderer.sendSync(AGENT_IDENTITY_CHANNEL) as AgentIdentity | null
const agentListeners = new Set<(event: AgentUiEvent) => void>()
let agentPort: MessagePort | undefined

function requireIdentity(): AgentIdentity {
  if (!identity || !identity.windowId || identity.chartId !== AGENT_CHART_ID) {
    throw new Error('The native Agent bridge is unavailable for this frame.')
  }
  return identity
}

async function invokeAgent<Command extends AgentCommand, Result>(
  command: Command,
  payload: AgentPayload<Command>,
): Promise<Result> {
  const target = requireIdentity()
  const response = (await ipcRenderer.invoke(AGENT_COMMAND_CHANNEL, {
    protocolVersion: AGENT_IPC_PROTOCOL_VERSION,
    payloadVersion: AGENT_IPC_PAYLOAD_VERSION,
    windowId: target.windowId,
    chartId: target.chartId,
    requestId: globalThis.crypto.randomUUID(),
    deadlineAt: Date.now() + 30_000,
    command,
    payload,
  })) as
    | { ok: true; value: Result }
    | {
        ok: false
        error: { code: string; message: string; retryable: boolean; recommendedAction?: string }
      }
  if (response.ok) return response.value
  throw response.error
}

const nativeAgent: AgentBridgeClient = {
  listSessions: () => invokeAgent<'session.list', AgentSessionView[]>('session.list', {}),
  openSession: (sessionId) =>
    invokeAgent<'session.open', AgentSessionSnapshot>('session.open', { sessionId }),
  getProviderStatus: () =>
    invokeAgent<'provider.status', ProviderStatusView>('provider.status', {}),
  listProviderModels: (input: ProviderModelsInput) =>
    invokeAgent<'provider.models', ProviderModelsResult>('provider.models', input),
  createSession: () => invokeAgent<'session.create', AgentSessionView>('session.create', {}),
  renameSession: (sessionId, title) =>
    invokeAgent<'session.rename', void>('session.rename', { sessionId, title }),
  deleteSession: (sessionId) =>
    invokeAgent<'session.delete', void>('session.delete', { sessionId }),
  startRun: (input: StartRunInput) =>
    invokeAgent<'run.start', { runId: string }>('run.start', input),
  cancelRun: (runId) => invokeAgent<'run.cancel', void>('run.cancel', { runId }),
  retryRun: (runId) => invokeAgent<'run.retry', { runId: string }>('run.retry', { runId }),
  confirmTool: (confirmationId, decision) =>
    invokeAgent<'tool.confirm', void>('tool.confirm', { confirmationId, decision }),
  undoTurn: (runId) => invokeAgent<'turn.undo', void>('turn.undo', { runId }),
  testProvider: (input: ProviderTestInput) =>
    invokeAgent<'provider.test', ProviderTestResult>('provider.test', input),
  deleteProviderCredential: () => invokeAgent<'provider.delete', void>('provider.delete', {}),
  subscribe(listener) {
    agentListeners.add(listener)
    return () => agentListeners.delete(listener)
  },
}

ipcRenderer.on(AGENT_PORT_CHANNEL, (event) => {
  agentPort?.close()
  agentPort = event.ports[0]
  if (!agentPort) return
  agentPort.addEventListener('message', (message) => {
    const value = message.data as AgentUiEvent
    for (const listener of agentListeners) listener(value)
  })
  agentPort.start()
})

if (identity) {
  ipcRenderer.postMessage(AGENT_CONNECT_CHANNEL, {
    protocolVersion: AGENT_IPC_PROTOCOL_VERSION,
    windowId: identity.windowId,
    chartId: identity.chartId,
  })
}

const api = {
  agent: nativeAgent,
  store: {
    get(key: string): unknown {
      return ipcRenderer.sendSync('store:get', key)
    },
    set(key: string, value: unknown): void {
      ipcRenderer.send('store:set', key, value)
    },
  },
  file: {
    saveDialog(options: {
      defaultName?: string
      filters?: Array<{ name: string; extensions: string[] }>
    }): Promise<string | null> {
      return ipcRenderer.invoke('file:save-dialog', options)
    },
    saveFile(filePath: string, content: string): Promise<boolean> {
      return ipcRenderer.invoke('file:save', filePath, content)
    },
    openDialog(options: {
      filters?: Array<{ name: string; extensions: string[] }>
      multiSelections?: boolean
    }): Promise<string[] | null> {
      return ipcRenderer.invoke('file:open-dialog', options)
    },
    readFile(filePath: string): Promise<string> {
      return ipcRenderer.invoke('file:read', filePath)
    },
  },
  window: {
    minimize(): void {
      ipcRenderer.send('window:minimize')
    },
    maximize(): void {
      ipcRenderer.send('window:maximize')
    },
    close(): void {
      ipcRenderer.send('window:close')
    },
    isMaximized(): Promise<boolean> {
      return ipcRenderer.invoke('window:is-maximized')
    },
    onMaximizeChange(callback: (maximized: boolean) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, maximized: boolean): void => {
        callback(maximized)
      }
      ipcRenderer.on('window:maximize-change', handler)
      return () => {
        ipcRenderer.removeListener('window:maximize-change', handler)
      }
    },
  },
  app: {
    getVersion(): string {
      return ipcRenderer.sendSync('app:get-version')
    },
  },
}

contextBridge.exposeInMainWorld('desktopAPI', api)
