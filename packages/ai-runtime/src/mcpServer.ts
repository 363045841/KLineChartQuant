import type { ControllerDescription } from '@363045841yyt/klinechart-core'
import type { WebSocket } from 'ws'
import { ALL_TOOLS } from './toolSchemas'
import { SessionRegistry } from './sessionRegistry'
import { createWsTransport, WsSessionHandle } from './wsTransport'
import { createMcpProtocol } from './mcpProtocol'

export interface McpServerOptions {
  serverInfo?: { name?: string; version?: string }
  ws?: { port?: number; host?: string }
  registry?: SessionRegistry
}

export interface McpServerInstance {
  server: ReturnType<typeof createMcpProtocol>['server']
  registry: SessionRegistry
  wss: ReturnType<typeof createWsTransport>['wss']
  start(): Promise<void>
  stop(): Promise<void>
}

function handleWsConnection(ws: WebSocket, registry: SessionRegistry): void {
  console.error(`[MCP] WS client connected`)
  let handle: WsSessionHandle | null = null

  ws.on('message', (raw: Buffer) => {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (msg.type === 'register') {
      const sessionId = (msg.sessionId as string) ?? crypto.randomUUID()
      handle = new WsSessionHandle(sessionId, ws)
      registry.register(sessionId, handle)
      console.error(
        `[MCP] Session registered: ${sessionId} (total=${registry.getActiveSessionIds().length})`,
      )
      ws.send(JSON.stringify({ type: 'registered', sessionId }))
      return
    }

    if (handle) {
      handle.handleMessage(msg)
    }

    if (msg.type === 'state:update' && handle) {
      registry.updateState(
        handle.sessionId,
        msg.descriptions as Record<string, ControllerDescription>,
      )
    }
  })

  ws.on('close', () => {
    if (handle) {
      console.error(`[MCP] Session disconnected: ${handle.sessionId}`)
      registry.unregister(handle.sessionId)
    }
  })

  ws.on('error', () => {
    if (handle) {
      registry.unregister(handle.sessionId)
    }
  })
}

function createCallToolHandler(registry: SessionRegistry) {
  return async (name: string, args: Record<string, unknown>) => {
    const schema = ALL_TOOLS.find((t) => t.name === name)
    if (!schema) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: `Unknown tool: ${name}`,
            }),
          },
        ],
        isError: true,
      }
    }

    const sessions = registry.getActiveSessionIds()
    if (sessions.length === 0) {
      console.warn(`[MCP] CallTool "${name}" but no sessions registered`)
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: 'No browser chart session connected.',
            }),
          },
        ],
        isError: true,
      }
    }

    const sessionId = sessions[0]!
    const handle = registry.get(sessionId)
    if (!handle) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: `Session ${sessionId} not found.`,
            }),
          },
        ],
        isError: true,
      }
    }

    const result = await handle.executeTool({ name, input: args })
    const summary = registry.getSummary(sessionId)
    const texts: string[] = [JSON.stringify(result)]
    if (summary) texts.push(`Chart state: ${summary}`)

    return {
      content: texts.map((text) => ({ type: 'text' as const, text })),
      isError: !result.success,
    }
  }
}

export function createMcpServer(options: McpServerOptions = {}): McpServerInstance {
  const registry = options.registry ?? new SessionRegistry()
  const wsPort = options.ws?.port ?? 8080
  const wsHost = options.ws?.host ?? '0.0.0.0'

  const transport = createWsTransport({ port: wsPort, host: wsHost })
  transport.wss.on('connection', (ws) => handleWsConnection(ws, registry))

  const protocol = createMcpProtocol({
    serverInfo: options.serverInfo,
    toolCatalog: ALL_TOOLS,
    handleCallTool: createCallToolHandler(registry),
  })

  return {
    server: protocol.server,
    registry,
    wss: transport.wss,
    start: protocol.start,
    async stop() {
      await protocol.stop()
      await transport.close()
    },
  }
}
