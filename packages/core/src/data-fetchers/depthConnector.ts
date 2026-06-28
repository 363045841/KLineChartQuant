/**
 * DepthConnector — bridges a DepthSource (data-fetcher layer) to one or
 * more HeatmapControllers (component layer).
 *
 * Usage:
 * ```ts
 * const source = new BinanceSSESource('btcusdt')
 * const controller = createHeatmapController({ tickSize: 0.01 })
 * const connector = new DepthConnector(source)
 * connector.addController(controller)
 * connector.start()
 * ```
 */

import type { DepthSource, DepthDelta, DepthSnapshot } from './depthTypes'
import type { HeatmapController, HeatmapControllerConfig } from '../components/orderBookHeatmap'

export interface DepthConnectorOptions {
  /** Initial config passed to each controller created by addController */
  defaultConfig?: Partial<HeatmapControllerConfig>
}

/**
 * Wires a real-time DepthSource to HeatmapController instances.
 *
 * Multiple controllers can be attached to the same source so a single
 * Binance stream can feed e.g. both a heatmap and a footprint component.
 */
export class DepthConnector {
  private controllers = new Set<HeatmapController>()
  private unsubDelta: (() => void) | null = null
  private unsubSnapshot: (() => void) | null = null
  private unsubError: (() => void) | null = null
  private started = false

  constructor(
    private readonly source: DepthSource,
    private readonly options?: DepthConnectorOptions,
  ) {}

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
    if (this.started) return
    this.started = true

    this.unsubDelta = this.source.onDelta((deltas: ReadonlyArray<DepthDelta>) => {
      for (const delta of deltas) {
        for (const ctrl of this.controllers) {
          ctrl.ingest(delta)
        }
      }
    })

    this.unsubSnapshot = this.source.onSnapshot((snapshot: DepthSnapshot) => {
      for (const ctrl of this.controllers) {
        ctrl.resetBook(snapshot)
      }
    })

    this.unsubError = this.source.onError((err: Error) => {
      console.error(`[DepthConnector] ${this.source.exchange} ${this.source.symbol}:`, err.message)
    })

    this.source.connect()
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    this.source.disconnect()
    this.unsubDelta?.()
    this.unsubDelta = null
    this.unsubSnapshot?.()
    this.unsubSnapshot = null
    this.unsubError?.()
    this.unsubError = null
  }

  destroy(): void {
    this.stop()
    for (const ctrl of this.controllers) {
      ctrl.dispose()
    }
    this.controllers.clear()
    this.source.destroy()
  }
}
