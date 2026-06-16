import type { ChartController } from '@363045841yyt/klinechart-core'
import { executeTool, type ToolCall, type ToolResult } from './executeTool'
import type { ControllerDescription } from './types'

export interface ChartBridgeOptions {
  wsUrl: string
  sessionId?: string
  autoReconnect?: boolean
  reconnectDelay?: number
  heartbeatInterval?: number
}

export type ChartBridgeEvent =
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'stateChanged'

type MessageHandler = (...args: unknown[]) => void

export class ChartBridge {
  readonly sessionId: string
  private readonly autoReconnect: boolean
  private readonly reconnectDelay: number
  private readonly heartbeatInterval: number

  private ws: WebSocket | null = null
  private chart: ChartController | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private destroyed = false

  private listeners = new Map<ChartBridgeEvent, Set<MessageHandler>>()

  onConnected?: () => void
  onDisconnected?: () => void
  onError?: (err: Error) => void
  onStateChange?: () => void

  constructor(options: ChartBridgeOptions) {
    this.sessionId = options.sessionId ?? crypto.randomUUID()
    this.autoReconnect = options.autoReconnect ?? true
    this.reconnectDelay = options.reconnectDelay ?? 3000
    this.heartbeatInterval = options.heartbeatInterval ?? 30_000
    this.wsUrl = options.wsUrl
  }

  private wsUrl: string

  register(chart: ChartController): void {
    this.chart = chart
  }

  unregister(): void {
    this.chart = null
  }

  async connect(): Promise<void> {
    if (this.destroyed) return
    this.disconnect()

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(this.wsUrl)

        ws.onopen = () => {
          this.ws = ws
          ws.send(JSON.stringify({ type: 'register', sessionId: this.sessionId }))
          this.startHeartbeat()
          this.onConnected?.()
          this.emit('connected')
          resolve()
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
          this.ws = null
          this.stopHeartbeat()
          this.onDisconnected?.()
          this.emit('disconnected')
          if (this.autoReconnect && !this.destroyed) {
            this.scheduleReconnect()
          }
        }

        ws.onerror = () => {
          const err = new Error('WebSocket connection failed')
          this.onError?.(err)
          this.emit('error', err)
          reject(err)
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  disconnect(): void {
    this.ws?.close()
    this.ws = null
    this.cancelReconnect()
    this.stopHeartbeat()
  }

  destroy(): void {
    this.destroyed = true
    this.disconnect()
    this.chart = null
    this.listeners.clear()
  }

  private handleMessage(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'registered': {
        break
      }

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

  private dispatchToolCall(requestId: string, call: ToolCall): void {
    if (!this.chart) {
      this.sendResult(requestId, {
        success: false,
        error: 'ChartController not registered',
      })
      return
    }

    const result = executeTool(this.chart, call)
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

  sendStateUpdate(
    descriptions: Record<string, ControllerDescription>,
  ): void {
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
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, this.heartbeatInterval)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private scheduleReconnect(): void {
    this.cancelReconnect()
    this.reconnectTimer = setTimeout(() => {
      if (!this.destroyed) {
        this.connect()
      }
    }, this.reconnectDelay)
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
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
