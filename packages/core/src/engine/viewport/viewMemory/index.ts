/** 序列视口记忆公开出口。 */
export { seriesViewportKey } from './impl/key.js'
export { createSeriesViewportMemory, readViewportSnapshot, type SeriesViewportMemory } from './impl/memory.js'
export { captureRange } from './impl/range.js'
export type { SeriesViewportSnapshot } from './types.js'
