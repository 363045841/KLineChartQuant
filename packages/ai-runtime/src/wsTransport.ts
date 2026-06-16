import { WebSocketServer, type WebSocket } from 'ws'
import type { ToolResult } from '@363045841yyt/klinechart-core'
import type { SessionHandle } from './sessionRegistry'

export class WsSessionHandle implements SessionHandle {
  readonly sessionId: string
  private ws: WebSocket
  private pending = new Map<
    string,
    { resolve: (r: ToolResult) => void; reject: (e: Error) => void }
  >()
  private msgSeq = 0

  constructor(sessionId: string, ws: WebSocket) {
    this.sessionId = sessionId
    this.ws = ws
  }

  async executeTool(call: {
    name: string
    input: Record<string, unknown>
  }): Promise<ToolResult> {
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

  // fallow-ignore-next-line unused-class-member
  isAlive(): boolean {
    return this.ws.readyState === this.ws.OPEN
  }
}

export interface WsTransportOptions {
  port: number
  host: string
}

export interface WsTransport {
  wss: WebSocketServer
  close(): Promise<void>
}

export function createWsTransport(opts: WsTransportOptions): WsTransport {
  const wss = new WebSocketServer({ port: opts.port, host: opts.host })

  wss.on('error', (err: NodeJS.ErrnoException) => {
    console.error(`[MCP] WebSocket server error: ${err.message}`)
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[MCP] Port ${opts.port} is already in use. Use a different port via WS_PORT env or ws.port option.`,
      )
    }
  })

  return {
    wss,
    async close() {
      for (const ws of wss.clients) ws.terminate()
      wss.close()
    },
  }
}
