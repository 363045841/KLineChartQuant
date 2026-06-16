import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { WebSocketServer, type WebSocket } from 'ws'
import type { ToolCall, ToolResult } from './executeTool'
import { ALL_TOOLS } from './toolSchemas'
import type { ControllerDescription } from './types'
import { SessionRegistry, type SessionHandle } from './sessionRegistry'

class WsSessionHandle implements SessionHandle {
  readonly sessionId: string
  private pending = new Map<
    string,
    { resolve: (r: ToolResult) => void; reject: (e: Error) => void }
  >()
  private msgSeq = 0

  constructor(
    sessionId: string,
    private ws: WebSocket,
  ) {
    this.sessionId = sessionId
  }

  async executeTool(call: ToolCall): Promise<ToolResult> {
    const requestId = `${this.sessionId}:${++this.msgSeq}`

    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject })

      if (this.ws.readyState !== this.ws.OPEN) {
        this.pending.delete(requestId)
        reject(new Error('WebSocket is not open'))
        return
      }

      this.ws.send(
        JSON.stringify({ type: 'tool:call', requestId, call }),
      )

      setTimeout(() => {
        const p = this.pending.get(requestId)
        if (p) {
          this.pending.delete(requestId)
          reject(new Error(`Tool call timed out: ${call.name}`))
        }
      }, 30_000)
    })
  }

  handleMessage(msg: Record<string, unknown>): void {
    if (msg.type === 'tool:result') {
      const requestId = msg.requestId as string
      const pending = this.pending.get(requestId)
      if (pending) {
        this.pending.delete(requestId)
        pending.resolve(msg.result as ToolResult)
      }
    }
  }

  isAlive(): boolean {
    return this.ws.readyState === this.ws.OPEN
  }
}

export type { WsSessionHandle }

interface ToolResponseContent {
  type: 'text'
  text: string
}

export interface McpServerOptions {
  serverInfo?: { name?: string; version?: string }
  ws?: { port?: number; host?: string }
  registry?: SessionRegistry
}

export interface McpServerInstance {
  server: Server
  registry: SessionRegistry
  wss: WebSocketServer
  start(): Promise<void>
  stop(): Promise<void>
}

export function createMcpServer(options: McpServerOptions = {}): McpServerInstance {
  const registry = options.registry ?? new SessionRegistry()
  const wsPort = options.ws?.port ?? 8080
  const wsHost = options.ws?.host ?? '0.0.0.0'

  const serverInfoName = options.serverInfo?.name ?? 'klinechart-ai-mcp'
  const serverInfoVersion = options.serverInfo?.version ?? '0.0.0'

  const server = new Server(
    {
      name: serverInfoName,
      version: serverInfoVersion,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }))

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: {
      params: { name: string; arguments?: Record<string, unknown> }
    }) => {
      const { name, arguments: args } = request.params
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

      const result = await handle.executeTool({
        name,
        input: args ?? {},
      })

      const summary = registry.getSummary(sessionId)
      const texts: string[] = [JSON.stringify(result)]
      if (summary) texts.push(`Chart state: ${summary}`)

      return {
        content: texts.map(
          (text): ToolResponseContent => ({ type: 'text' as const, text }),
        ),
      }
    },
  )

  const wss = new WebSocketServer({ port: wsPort, host: wsHost })

  wss.on('connection', (ws: WebSocket) => {
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
        registry.unregister(handle.sessionId)
      }
    })

    ws.on('error', () => {
      if (handle) {
        registry.unregister(handle.sessionId)
      }
    })
  })

  async function start(): Promise<void> {
    const transport = new StdioServerTransport()
    await server.connect(transport)
  }

  async function stop(): Promise<void> {
    await server.close()
    wss.close()
  }

  return { server, registry, wss, start, stop }
}
