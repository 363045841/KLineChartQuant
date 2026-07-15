import type { ToolResult } from '@363045841yyt/klinechart-core'
import { Deferred, Effect, pipe } from 'effect'
import { WebSocketServer, type WebSocket } from 'ws'

import type { SessionHandle } from './sessionRegistry'

export class WsSessionHandle implements SessionHandle {
  readonly sessionId: string
  private ws: WebSocket
  // Deferred 相当于一个可外部完成的 Promise，用于 Effect 和事件回调之间桥接
  private pending = new Map<string, Deferred.Deferred<ToolResult, Error>>()
  private msgSeq = 0

  constructor(sessionId: string, ws: WebSocket) {
    this.sessionId = sessionId
    this.ws = ws
  }

  async executeTool(call: { name: string; input: Record<string, unknown> }): Promise<ToolResult> {
    const requestId = `${this.sessionId}:${++this.msgSeq}`

    // 整体流程：创建 Deferred → 发送 WS → 等待结果（含超时）
    return Effect.runPromise(
      pipe(
        // suspend = 惰性求值，在 Effect 执行时才检查 WS 状态
        Effect.suspend(() => {
          if (this.ws.readyState !== this.ws.OPEN) {
            return Effect.fail(new Error('WebSocket is not open'))
          }
          return pipe(
            Deferred.make<ToolResult, Error>(), // 创建一个可外部完成的一次性变量
            Effect.tap(
              (
                deferred, // defered 请求逻辑
              ) =>
                Effect.sync(() => {
                  // 存储 deffered
                  this.pending.set(requestId, deferred)
                  this.ws.send(JSON.stringify({ type: 'tool:call', requestId, call }))
                }),
            ),
          )
        }),
        Effect.flatMap((deferred) =>
          pipe(
            Deferred.await(deferred), // 等待 handleMessage 完成这个 Deferred
            Effect.timeout('30 seconds'), // 超时保护：30s 无响应则自动失败
            Effect.tapError(() =>
              Effect.sync(() => {
                this.pending.delete(requestId) // 超时后清理 pending 表
              }),
            ),
          ),
        ),
        // 统一错误类型：TimeoutException → Error
        Effect.mapError((err) => {
          if (err instanceof Error) return err
          return new Error(`Tool call timed out: ${call.name}`)
        }),
      ),
    )
  }

  handleMessage(msg: Record<string, unknown>): void {
    if (msg.type === 'tool:result') {
      const requestId = msg.requestId as string
      const deferred = this.pending.get(requestId)
      if (deferred) {
        this.pending.delete(requestId)
        // 从 WS 事件回调中完成 Deferred，让等待的 executeTool 继续执行
        Effect.runFork(Deferred.succeed(deferred, msg.result as ToolResult))
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
