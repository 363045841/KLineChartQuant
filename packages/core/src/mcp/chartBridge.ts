import { Effect, Fiber, pipe, Schedule } from 'effect'

import { KLineChartError } from '../errors'
import { generateUUID } from '../utils/uuid'

import type { ToolCall, ToolResult, ControllerDescription, ToolCallHandler } from './types'


export interface ChartBridgeOptions {
  wsUrl: string
  onToolCall: ToolCallHandler
  sessionId?: string
  autoReconnect?: boolean
  reconnectDelay?: number
  maxReconnectDelay?: number
  heartbeatInterval?: number
  wsImpl?: new (url: string) => WebSocket
}

export type ChartBridgeEvent = 'connected' | 'disconnected' | 'error' | 'stateChanged'

type MessageHandler = (...args: unknown[]) => void

export class ChartBridge {
  readonly sessionId: string
  private readonly autoReconnect: boolean
  private readonly reconnectDelay: number
  private readonly maxReconnectDelay: number
  private readonly heartbeatInterval: number
  private readonly onToolCall: ToolCallHandler

  private readonly wsImpl: new (url: string) => WebSocket
  private ws: WebSocket | null = null
  private _heartbeatFiber: Fiber.Fiber<void> | null = null
  private _reconnectFiber: Fiber.Fiber<void> | null = null
  private _reconnectAttempt = 0
  private destroyed = false

  private listeners = new Map<ChartBridgeEvent, Set<MessageHandler>>()

  onConnected?: () => void
  onDisconnected?: () => void
  onError?: (err: Error) => void
  onStateChange?: () => void

  constructor(options: ChartBridgeOptions) {
    this.sessionId = options.sessionId ?? generateUUID()
    this.autoReconnect = options.autoReconnect ?? true
    this.reconnectDelay = options.reconnectDelay ?? 3000
    this.maxReconnectDelay = options.maxReconnectDelay ?? 30_000
    this.heartbeatInterval = options.heartbeatInterval ?? 30_000
    this.onToolCall = options.onToolCall
    this.wsImpl = options.wsImpl ?? WebSocket
    this.wsUrl = options.wsUrl
  }

  private wsUrl: string

  async connect(): Promise<void> {
    if (this.destroyed) return
    this.disconnect()

    await Effect.runPromise(
      pipe(
        Effect.async<void, Error>((resume) => {
          try {
            const ws = new this.wsImpl(this.wsUrl)

            ws.onopen = () => {
              this._reconnectAttempt = 0
              this.ws = ws
              console.info(
                `[ChartBridge] WS opened → sending register (sessionId=${this.sessionId})`,
              )
              ws.send(JSON.stringify({ type: 'register', sessionId: this.sessionId }))
              this.startHeartbeat()
              this.onConnected?.()
              this.emit('connected')
              resume(Effect.succeed(undefined))
            }

            ws.onmessage = (event: MessageEvent) => {
              let msg: Record<string, unknown>
              try {
                msg = JSON.parse(event.data as string)
              } catch {
                return
              }
              this.handleMessage(msg)
            }

            ws.onclose = () => {
              console.warn(`[ChartBridge] WS closed, autoReconnect=${this.autoReconnect}`)
              this.ws = null
              this.stopHeartbeat()
              this.onDisconnected?.()
              this.emit('disconnected')
              if (this.autoReconnect && !this.destroyed) {
                this.scheduleReconnect()
              }
            }

            ws.onerror = () => {
              console.error(`[ChartBridge] WS error — connection failed`)
              const err = new KLineChartError('FETCH_FAILED', 'WebSocket connection failed')
              this.onError?.(err)
              this.emit('error', err)
              resume(Effect.fail(err))
            }
          } catch (err) {
            resume(Effect.fail(err as Error))
          }
        }),
        Effect.timeout('15 seconds'),
        Effect.mapError((err) => {
          if (err instanceof KLineChartError) return err
          return new KLineChartError('FETCH_FAILED', `Connection failed: ${String(err)}`)
        }),
      ),
    )
  }

  disconnect(): void {
    this.ws?.close()
    this.ws = null
    this.cancelReconnect()
    this.stopHeartbeat()
  }

  destroy(): void {
    this.destroyed = true
    this._reconnectAttempt = 0
    this.disconnect()
    this.listeners.clear()
  }

  private handleMessage(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'registered':
        break

      case 'tool:call': {
        const call = msg.call as ToolCall
        const requestId = msg.requestId as string
        this.dispatchToolCall(requestId, call)
        break
      }

      case 'ping': {
        this.ws?.send(JSON.stringify({ type: 'pong' }))
        break
      }
    }
  }

  private async dispatchToolCall(requestId: string, call: ToolCall): Promise<void> {
    const result = await this.onToolCall(call)
    this.sendResult(requestId, result)

    if (this.onStateChange) {
      this.onStateChange()
    }
    this.emit('stateChanged')
  }

  private sendResult(requestId: string, result: ToolResult): void {
    this.ws?.send(
      JSON.stringify({
        type: 'tool:result',
        requestId,
        result,
      }),
    )
  }

  sendStateUpdate(descriptions: Record<string, ControllerDescription>): void {
    this.ws?.send(
      JSON.stringify({
        type: 'state:update',
        sessionId: this.sessionId,
        descriptions,
      }),
    )
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this._heartbeatFiber = Effect.runFork(
      pipe(
        Effect.repeat(
          Effect.sync(() => {
            if (this.ws?.readyState === 1) {
              this.ws.send(JSON.stringify({ type: 'ping' }))
            }
          }),
          Schedule.fixed(this.heartbeatInterval),
        ),
        Effect.asVoid,
      ),
    )
  }

  private stopHeartbeat(): void {
    if (this._heartbeatFiber) {
      Fiber.interrupt(this._heartbeatFiber)
      this._heartbeatFiber = null
    }
  }

  private scheduleReconnect(): void {
    this.cancelReconnect()
    const attempt = this._reconnectAttempt
    this._reconnectAttempt = attempt + 1

    const base = this.reconnectDelay
    const exponential = Math.min(base * Math.pow(2, attempt), this.maxReconnectDelay)
    const jitter = 0.5 + Math.random() * 0.5
    const delay = Math.round(exponential * jitter)

    this._reconnectFiber = Effect.runFork(
      pipe(
        Effect.sleep(delay),
        Effect.tap(() =>
          Effect.sync(() => {
            if (!this.destroyed) {
              console.info(
                `[ChartBridge] reconnect scheduled in ${delay}ms (attempt ${attempt + 1})`,
              )
              this.connect().catch(() => {})
            }
          }),
        ),
      ),
    )
  }

  private cancelReconnect(): void {
    if (this._reconnectFiber) {
      Fiber.interrupt(this._reconnectFiber)
      this._reconnectFiber = null
    }
  }

  private emit(event: ChartBridgeEvent, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((fn) => fn(...args))
  }

  on(event: ChartBridgeEvent, handler: MessageHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)
    return () => this.listeners.get(event)?.delete(handler)
  }

  off(event: ChartBridgeEvent, handler: MessageHandler): void {
    this.listeners.get(event)?.delete(handler)
  }
}
