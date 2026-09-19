/**
 * MT5 实时 K 线消费器：EventSource 封装（Mt5LiveSource）+ 帧驱动的 updateBars 接线
 * （RealtimeBarsConnector）。EventSource 原生重连；断线重连凭 Last-Event-ID 由连接器补帧。
 */
import type { KLineData } from '../../controllers/types.js'
import { KLineChartError } from '../../errors.js'
import type { BarAggregation } from '../provider/types.js'

/** SSE 帧里的 K 线载荷（UTC 毫秒时间戳）。 */
export interface Mt5LiveBar {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
  turnover?: number
}

/** MT5-Connecter SSE 帧协议：snapshot/forming/closed/status。 */
export type Mt5LiveFrame =
  | { type: 'snapshot'; symbol: string; period: string; bars: Mt5LiveBar[] }
  | { type: 'forming'; symbol: string; period: string; bar: Mt5LiveBar }
  | { type: 'closed'; symbol: string; period: string; bar: Mt5LiveBar }
  | { type: 'status'; symbol: string; period: string; status: string; detail?: string }

/** 连接器生命周期状态（EventSource 驱动）。 */
export type Mt5LiveStatus = 'connecting' | 'connected' | 'disconnected'

/** 本地 MT5-Connecter 默认地址。 */
export const DEFAULT_MT5_SSE_URL = 'http://127.0.0.1:8090'

/** 单连接固定订阅一个 (symbol, period, barAggregation)；切换任一维度均断开重连。 */
export class Mt5LiveSource {
  private es: EventSource | null = null
  private frameCbs = new Set<(frame: Mt5LiveFrame) => void>()
  private statusCbs = new Set<(status: Mt5LiveStatus) => void>()
  private errorCbs = new Set<(err: Error) => void>()
  private destroyed = false

  constructor(
    readonly symbol: string,
    readonly period: string,
    readonly barAggregation: BarAggregation,
    private readonly baseUrl: string = DEFAULT_MT5_SSE_URL,
    private readonly esFactory?: (url: string) => EventSource,
  ) {}

  /** 订阅数据帧；返回退订函数。 */
  onFrame(cb: (frame: Mt5LiveFrame) => void): () => void {
    this.frameCbs.add(cb)
    return () => this.frameCbs.delete(cb)
  }

  /** 订阅连接状态；返回退订函数。 */
  onStatus(cb: (status: Mt5LiveStatus) => void): () => void {
    this.statusCbs.add(cb)
    return () => this.statusCbs.delete(cb)
  }

  /** 订阅解析错误；返回退订函数。 */
  onError(cb: (err: Error) => void): () => void {
    this.errorCbs.add(cb)
    return () => this.errorCbs.delete(cb)
  }

  /** 建立 SSE 连接；重复调用先断开旧连接。 */
  connect(): void {
    if (this.destroyed) return
    this.disconnect()
    this.emitStatus('connecting')

    const url = `${this.baseUrl}/api/v1/market-data/sources/mt5/stream?symbol=${encodeURIComponent(this.symbol)}&period=${encodeURIComponent(this.period)}&barAggregation=${encodeURIComponent(this.barAggregation)}`
    const factory = this.esFactory ?? ((target: string) => new EventSource(target))
    this.es = factory(url)

    this.es.onopen = () => {
      if (!this.destroyed) this.emitStatus('connected')
    }
    this.es.onerror = () => {
      if (this.destroyed) return
      this.emitStatus('disconnected')
      // EventSource 自动重连，无需手动处理
    }
    this.es.onmessage = (event: MessageEvent) => {
      if (this.destroyed) return
      const raw = event.data as string
      if (raw === '' || raw.startsWith(':')) return
      try {
        const frame = JSON.parse(raw) as Mt5LiveFrame
        for (const cb of this.frameCbs) cb(frame)
      } catch (e) {
        const err = new KLineChartError(
          'FETCH_FAILED',
          `Mt5LiveSource parse error: ${(e as Error).message}`,
        )
        for (const cb of this.errorCbs) cb(err)
      }
    }
  }

  /** 断开连接并广播 disconnected。 */
  disconnect(): void {
    if (this.es) {
      this.es.close()
      this.es = null
      this.emitStatus('disconnected')
    }
  }

  /** 销毁：断开连接并清空全部回调。 */
  destroy(): void {
    this.destroyed = true
    this.disconnect()
    this.frameCbs.clear()
    this.statusCbs.clear()
    this.errorCbs.clear()
  }

  /** 广播连接状态。 */
  private emitStatus(status: Mt5LiveStatus): void {
    for (const cb of this.statusCbs) cb(status)
  }
}

/** 实时写入端：ChartController 或仅暴露 updateBars 的替身。 */
export interface RealtimeBarsSink {
  updateBars(bars: ReadonlyArray<KLineData>): void
}

/** 把 SSE 帧序列转成 updateBars 原子写的最小接受端。 */
function toKLineData(bar: Mt5LiveBar): KLineData {
  return {
    timestamp: bar.timestamp,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume ?? 0,
    turnover: bar.turnover ?? 0,
  }
}

/**
 * 帧驱动接线：Mt5LiveSource → sink.updateBars。
 *
 * - closed 帧先暂存，随后的 forming 帧合并为一次原子写（收线 + 新开一根）；
 * - 快照帧自带全量尾态，直接整批写入并清空暂存；
 * - 暂存的终值在断流/停止时冲刷，保证收线值不丢。
 */
export class RealtimeBarsConnector {
  private unsubFrame: (() => void) | null = null
  private unsubError: (() => void) | null = null
  private pendingClosed: KLineData | null = null
  private started = false

  constructor(
    private readonly sink: RealtimeBarsSink,
    private readonly source: Mt5LiveSource,
  ) {}

  /** 开始消费帧并连接数据源；重复调用无效果。 */
  start(): void {
    if (this.started) return
    this.started = true
    this.unsubFrame = this.source.onFrame((frame) => this.handleFrame(frame))
    this.unsubError = this.source.onError((err) => {
      // 解析异常不影响连接（EventSource 继续收流），仅冲刷暂存避免终值滞留
      this.flushPendingClosed()
      console.error(`[RealtimeBarsConnector] ${this.source.symbol}:`, err.message)
    })
    this.source.connect()
  }

  /** 停止消费并断开数据源；冲刷暂存的收线终值。 */
  stop(): void {
    if (!this.started) return
    this.started = false
    this.flushPendingClosed()
    this.source.disconnect()
    this.unsubFrame?.()
    this.unsubFrame = null
    this.unsubError?.()
    this.unsubError = null
  }

  /** 帧分发：closed 暂存、forming 合并写、snapshot 整批写。 */
  private handleFrame(frame: Mt5LiveFrame): void {
    if (frame.type === 'closed') {
      this.pendingClosed = toKLineData(frame.bar)
      return
    }
    if (frame.type === 'forming') {
      const forming = toKLineData(frame.bar)
      // 暂存的收线终值与新 forming 合并为一次原子写
      const batch = this.pendingClosed ? [this.pendingClosed, forming] : [forming]
      this.pendingClosed = null
      this.sink.updateBars(batch)
      return
    }
    if (frame.type === 'snapshot') {
      // 快照即全量尾态，暂存随之作废
      this.pendingClosed = null
      this.sink.updateBars(frame.bars.map(toKLineData))
    }
  }

  /** 冲刷暂存的收线终值（市场恰在收线后停流/断连的场景）。 */
  private flushPendingClosed(): void {
    if (this.pendingClosed === null) return
    const pending = this.pendingClosed
    this.pendingClosed = null
    this.sink.updateBars([pending])
  }
}
