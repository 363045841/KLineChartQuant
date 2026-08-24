import {
  AGENT_IPC_PROTOCOL_VERSION,
  type AgentApplicationService,
} from '@363045841yyt/klinechart-agent-runtime'
import {
  BrowserWindow,
  ipcMain,
  MessageChannelMain,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type MessagePortMain,
} from 'electron'

import {
  AGENT_CHART_ID,
  AGENT_COMMAND_CHANNEL,
  AGENT_CONNECT_CHANNEL,
  AGENT_IDENTITY_CHANNEL,
  AGENT_PORT_CHANNEL,
} from './agent-ipc-channels'
import { AgentIpcRouter, type AgentIpcSenderContext } from './agent-ipc-router'

interface ConnectionIdentity {
  senderId: string
  windowId: string
  chartId: typeof AGENT_CHART_ID
}

function identityFor(
  event: IpcMainEvent | IpcMainInvokeEvent,
): ConnectionIdentity & { isMainFrame: boolean } {
  const window = BrowserWindow.fromWebContents(event.sender)
  return {
    senderId: String(event.sender.id),
    windowId: window ? String(window.id) : '',
    chartId: AGENT_CHART_ID,
    isMainFrame: event.senderFrame === event.sender.mainFrame,
  }
}

function isConnectPayload(value: unknown, identity: ConnectionIdentity): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return (
    keys.length === 3 &&
    'protocolVersion' in value &&
    value.protocolVersion === AGENT_IPC_PROTOCOL_VERSION &&
    'windowId' in value &&
    value.windowId === identity.windowId &&
    'chartId' in value &&
    value.chartId === identity.chartId
  )
}

export interface RegisteredAgentIpc {
  close(): Promise<void>
}

export function registerAgentIpc(application: AgentApplicationService): RegisteredAgentIpc {
  const router = new AgentIpcRouter({ application })
  const ports = new Map<string, Set<MessagePortMain>>()

  ipcMain.on(AGENT_IDENTITY_CHANNEL, (event) => {
    const identity = identityFor(event)
    event.returnValue = identity.isMainFrame
      ? { windowId: identity.windowId, chartId: identity.chartId }
      : null
  })

  ipcMain.handle(AGENT_COMMAND_CHANNEL, async (event, request: unknown) => {
    const identity = identityFor(event)
    const sender: AgentIpcSenderContext = identity
    return router.route(request, sender)
  })

  ipcMain.on(AGENT_CONNECT_CHANNEL, (event, payload: unknown) => {
    const identity = identityFor(event)
    if (!identity.isMainFrame || !isConnectPayload(payload, identity)) return

    const { port1, port2 } = new MessageChannelMain()
    let closed = false
    const senderPorts = ports.get(identity.senderId) ?? new Set<MessagePortMain>()
    ports.set(identity.senderId, senderPorts)
    senderPorts.add(port1)

    const unsubscribe = application.subscribe((agentEvent) => {
      if (!closed) port1.postMessage(agentEvent)
    })
    const cleanup = (): void => {
      if (closed) return
      closed = true
      unsubscribe()
      senderPorts.delete(port1)
      if (senderPorts.size === 0) ports.delete(identity.senderId)
      router.release(identity.senderId)
      void application.interruptOwnedRuns()
    }
    port1.on('close', cleanup)
    event.sender.once('destroyed', cleanup)
    port1.start()
    event.senderFrame?.postMessage(AGENT_PORT_CHANNEL, null, [port2])
  })

  return {
    async close() {
      ipcMain.removeHandler(AGENT_COMMAND_CHANNEL)
      ipcMain.removeAllListeners(AGENT_CONNECT_CHANNEL)
      ipcMain.removeAllListeners(AGENT_IDENTITY_CHANNEL)
      for (const senderPorts of ports.values()) for (const port of senderPorts) port.close()
      ports.clear()
      await application.interruptOwnedRuns()
    },
  }
}
