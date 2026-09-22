/**
 * Public surface of the order-book heatmap module.
 *
 * Consumers should import from this barrel; nothing here is wired into
 * `packages/core/src/index.ts` yet (the renderer integration lands in P1).
 */

export { createHeatmapController } from './impl/createHeatmapController.js'
export { createOrderBookState } from './impl/createOrderBookState.js'
export { createDeltaArchive } from './impl/deltaArchive.js'
export { createLogColorScale } from './impl/logColorScale.js'
export { createSnapshotRing } from './impl/snapshotRing.js'
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
