/**
 * DepthConnector — bridges a DepthSource (data-fetcher layer) to one or
 * more HeatmapControllers (component layer).
 *
 * 注意：旧的 GoTDX `binance-api`（:8081）SSE 深度适配器已移除。实时盘口来源需要新增
 * `DepthSource` 适配器，接入 Binance-Connector 的
 * `/api/v1/market-data/sources/binance/depth/stream`；Heatmap 控制器与连接器本身保留。
 *
 * Usage:
 * ```ts
 * const source = myDepthSource()
 * const controller = createHeatmapController({ tickSize: 0.01 })
 * const connector = new DepthConnector(source)
 * connector.addController(controller)
 * connector.start()
 * ```
 */

import type { HeatmapController } from '@/components/orderBookHeatmap/index.js'

import type { DepthDelta, DepthSnapshot, DepthSource } from '../types.js'

/**
 * Wires a real-time DepthSource to HeatmapController instances.
 *
 * Multiple controllers can be attached to the same source so a single
 * Binance stream can feed e.g. both a heatmap and a footprint component.
 */
export class DepthConnector {
  private controllers = new Set<HeatmapController>()
  private subscriptions: Array<() => void> | undefined

  constructor(private readonly source: DepthSource) {}

  /**
   * Add a controller to receive deltas from the source.
   * Safe to call before or after start() — already-started sources
   * will begin feeding immediately.
   */
  addController(controller: HeatmapController): void {
    this.controllers.add(controller)
  }

  removeController(controller: HeatmapController): void {
    this.controllers.delete(controller)
  }

  getControllerCount(): number {
    return this.controllers.size
  }

  start(): void {
    if (this.subscriptions) return
    const subscriptions: Array<() => void> = []
    this.subscriptions = subscriptions
    try {
      subscriptions.push(this.source.onDelta((deltas: readonly DepthDelta[]) => {
        for (const delta of deltas) this.deliver((controller) => controller.ingest(delta))
      }))
      subscriptions.push(this.source.onSnapshot((snapshot: DepthSnapshot) => {
        this.deliver((controller) => controller.resetBook(snapshot))
      }))
      subscriptions.push(this.source.onError((error) => this.reportError(error)))
      this.source.connect()
    } catch (error) {
      try {
        this.stop()
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Depth connection setup and cleanup failed')
      }
      throw error
    }
  }

  private reportError(error: unknown): void {
    console.error(`[DepthConnector] ${this.source.exchange} ${this.source.symbol}:`, error)
  }

  private deliver(run: (controller: HeatmapController) => void): void {
    for (const controller of this.controllers) {
      try {
        run(controller)
      } catch (error) {
        this.reportError(error)
      }
    }
  }

  stop(): void {
    const subscriptions = this.subscriptions
    if (!subscriptions) return
    this.subscriptions = undefined
    this.release([...subscriptions, () => this.source.disconnect()])
  }

  destroy(): void {
    const controllers = [...this.controllers]
    this.controllers.clear()
    this.release([() => this.stop(), ...controllers.map((controller) => () => controller.dispose()), () => this.source.destroy()])
  }

  private release(cleanups: readonly (() => void)[]): void {
    const failures: unknown[] = []
    for (const cleanup of cleanups) {
      try {
        cleanup()
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length) throw new AggregateError(failures, 'Depth connector cleanup failed')
  }
}
