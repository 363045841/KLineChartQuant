/**
 * Public surface of the order-book heatmap module.
 *
 * Consumers should import from this barrel; nothing here is wired into
 * `packages/core/src/index.ts` yet (the renderer integration lands in P1).
 */

export { createHeatmapController } from './createHeatmapController.js'
export { createOrderBookState } from './createOrderBookState.js'
export { createDeltaArchive } from './deltaArchive.js'
export { createLogColorScale } from './logColorScale.js'
export { createSnapshotRing } from './snapshotRing.js'
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
} from './types.js'
