/**
 * Public surface of the order-book heatmap module.
 *
 * Consumers should import from this barrel; nothing here is wired into
 * `packages/core/src/index.ts` yet (the renderer integration lands in P1).
 */

export { createHeatmapController } from './createHeatmapController'
export { createOrderBookState } from './createOrderBookState'
export { createDeltaArchive } from './deltaArchive'
export { createLogColorScale } from './logColorScale'
export { createSnapshotRing } from './snapshotRing'
export type {
  BookSnapshot,
  DeltaArchive,
  DeltaArchiveOptions,
  HeatmapController,
  HeatmapControllerConfig,
  HeatmapState,
  LogColorScale,
  OrderBookDelta,
  OrderBookState,
  OrderBookStateOptions,
  SnapshotRing,
} from './types'
