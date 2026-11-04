/**
 * 实时 K 线消费器：把池投递的帧序列转成 updateBars 原子写。
 *
 * 连接生命周期归池；这里只保留 K 线语义（收线暂存、forming 合并、历史修正、失效重拉）。
 */

import type { KLineData } from '@/controllers/types.js'
import type { LiveBar, RealtimeSubscription } from '../types.js'

/** 实时写入端：ChartController 或仅暴露 updateBars 的替身。 */
export interface RealtimeBarsSink {
  updateBars(bars: ReadonlyArray<KLineData>, strictTail?: boolean): void
  correctBar?(bar: KLineData): void
  invalidate?(): void
  setError?(message: string): void
}

/** 把实时载荷转成图表数据形状；缺失的量额补零，保持下游字段稳定。 */
function toKLineData(bar: LiveBar): KLineData {
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
 * 帧驱动接线：RealtimeSubscription → sink.updateBars。
 *
 * - closed 帧先暂存，随后的 forming 帧合并为一次原子写（收线 + 新开一根）；
 * - 快照帧自带全量尾态，直接整批写入并清空暂存；
 * - 暂存的终值在停止时冲刷，保证收线值不丢。
 */
export class RealtimeBarsConnector {
  private unsubFrame: (() => void) | null = null
  private unsubError: (() => void) | null = null
  private pendingClosed: KLineData | null = null
  private started = false

  constructor(
    private readonly sink: RealtimeBarsSink,
    private readonly subscription: RealtimeSubscription,
  ) {}

  /** 开始消费订阅帧；连接由池维护，这里不负责建立。 */
  start(): void {
    if (this.started) return
    this.started = true
    this.unsubFrame = this.subscription.onFrame((frame) => {
      if (frame.channel === 'bars') this.handleFrame(frame)
    })
    this.unsubError = this.subscription.onError((error) => {
      // 解析异常不影响连接继续收流，仅冲刷暂存避免终值滞留。
      this.flushPendingClosed()
      if (this.sink.setError) this.sink.setError(error.message)
      else console.error('[RealtimeBarsConnector]', error.message)
    })
  }

  /** 停止消费并释放订阅；冲刷暂存的收线终值。 */
  stop(): void {
    if (!this.started) return
    this.started = false
    this.flushPendingClosed()
    this.unsubFrame?.()
    this.unsubFrame = null
    this.unsubError?.()
    this.unsubError = null
    this.subscription.close()
  }

  /** 帧分发：closed 暂存、forming 合并写、snapshot 整批写。 */
  private handleFrame(
    frame: Extract<import('../types.js').LiveFrame, { channel: 'bars' }>,
  ): void {
    if (frame.type === 'update') {
      this.sink.updateBars([toKLineData(frame.bar)], true)
      return
    }
    if (frame.type === 'historical') {
      if (!this.sink.correctBar) throw new Error('Historical correction is not supported by this sink')
      this.sink.correctBar(toKLineData(frame.bar))
      return
    }
    if (frame.type === 'invalidate') {
      if (!this.sink.invalidate) throw new Error('Invalidation is not supported by this sink')
      this.pendingClosed = null
      this.sink.invalidate()
      return
    }
    if (frame.type === 'closed') {
      this.pendingClosed = toKLineData(frame.bar)
      return
    }
    if (frame.type === 'forming') {
      const forming = toKLineData(frame.bar)
      // 暂存的收线终值与新 forming 合并为一次原子写。
      const batch = this.pendingClosed ? [this.pendingClosed, forming] : [forming]
      this.pendingClosed = null
      this.sink.updateBars(batch)
      return
    }
    // snapshot：全量尾态，暂存随之作废。
    if (frame.type !== 'snapshot') return
    this.pendingClosed = null
    this.sink.updateBars(frame.bars.map(toKLineData))
  }

  /** 冲刷暂存的收线终值（市场恰在收线后停流/断连的场景）。 */
  private flushPendingClosed(): void {
    if (this.pendingClosed === null) return
    const pending = this.pendingClosed
    this.pendingClosed = null
    this.sink.updateBars([pending])
  }
}
