import { KLineChartError } from '../errors'
import type { DepthDelta, DepthSnapshot, DepthSource, DepthSourceStatus } from './depthTypes'

export const DEFAULT_BINANCE_SSE_URL = 'http://localhost:8081/api/biance/depth-events'

/**
 * SSE-based depth source for Binance.
 *
 * Connects to the Go backend's SSE endpoint, which internally proxies
 * Binance's WebSocket `depthUpdate` stream and pushes deltas as SSE events.
 *
 * EventSource natively handles reconnection — no manual reconnect logic needed.
 */
export class BinanceSSESource implements DepthSource {
  readonly exchange = 'binance'

  private es: EventSource | null = null
  private deltaCbs = new Set<(deltas: ReadonlyArray<DepthDelta>) => void>()
  private snapshotCbs = new Set<(snapshot: DepthSnapshot) => void>()
  private statusCbs = new Set<(status: DepthSourceStatus) => void>()
  private errorCbs = new Set<(err: Error) => void>()
  private destroyed = false

  constructor(
    readonly symbol: string,
    private readonly baseUrl: string = DEFAULT_BINANCE_SSE_URL,
    private readonly esFactory?: (url: string) => EventSource,
  ) {}

  private get url(): string {
    return `${this.baseUrl}?symbol=${this.symbol}`
  }

  onDelta(cb: (deltas: ReadonlyArray<DepthDelta>) => void): () => void {
    this.deltaCbs.add(cb)
    return () => this.deltaCbs.delete(cb)
  }

  onSnapshot(cb: (snapshot: DepthSnapshot) => void): () => void {
    this.snapshotCbs.add(cb)
    return () => this.snapshotCbs.delete(cb)
  }

  onStatus(cb: (status: DepthSourceStatus) => void): () => void {
    this.statusCbs.add(cb)
    return () => this.statusCbs.delete(cb)
  }

  onError(cb: (err: Error) => void): () => void {
    this.errorCbs.add(cb)
    return () => this.errorCbs.delete(cb)
  }

  connect(): void {
    if (this.destroyed) return
    this.disconnect()
    this.emitStatus('connecting')

    const factory = this.esFactory ?? ((url: string) => new EventSource(url))
    this.es = factory(this.url)

    this.es.onopen = () => {
      if (this.destroyed) return
      this.emitStatus('connected')
    }

    this.es.onerror = () => {
      if (this.destroyed) return
      this.emitStatus('disconnected')
      // EventSource auto-reconnects — no explicit reconnect needed
    }

    this.es.onmessage = (event: MessageEvent) => {
      if (this.destroyed) return
      const raw = event.data as string
      if (raw === '' || raw.startsWith(':')) return  // keepalive

      try {
        const msg = JSON.parse(raw) as {
          type: string
          bids?: ReadonlyArray<readonly [number, number]>
          asks?: ReadonlyArray<readonly [number, number]>
          entries?: ReadonlyArray<DepthDelta>
          timestamp?: number
        }

        if (msg.type === 'snapshot' && msg.bids && msg.asks && msg.timestamp !== undefined) {
          const snapshot: DepthSnapshot = {
            bids: msg.bids,
            asks: msg.asks,
            timestamp: msg.timestamp,
          }
          for (const cb of this.snapshotCbs) cb(snapshot)
        } else if (msg.type === 'delta' && Array.isArray(msg.entries)) {
          for (const cb of this.deltaCbs) cb(msg.entries)
        }
      } catch (e) {
        const err =
          e instanceof KLineChartError
            ? e
            : new KLineChartError('DEPTH_SOURCE_ERROR', `BinanceSSE parse error: ${(e as Error).message}`)
        for (const cb of this.errorCbs) cb(err)
      }
    }
  }

  disconnect(): void {
    if (this.es) {
      this.es.close()
      this.es = null
      this.emitStatus('disconnected')
    }
  }

  destroy(): void {
    this.destroyed = true
    this.disconnect()
    this.deltaCbs.clear()
    this.snapshotCbs.clear()
    this.statusCbs.clear()
    this.errorCbs.clear()
  }

  private emitStatus(status: DepthSourceStatus): void {
    for (const cb of this.statusCbs) cb(status)
  }
}
