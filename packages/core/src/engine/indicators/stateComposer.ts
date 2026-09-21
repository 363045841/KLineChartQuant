/**
 * Instance render-state projection.
 *
 * Calculation results are addressed only by chart instance.  This module deliberately
 * accepts one result entry at a time: it must never reconstruct a type-indexed bundle.
 */
import type { KLineData } from '../../foundation/types/price.js'
import type { IndicatorMetadata } from './indicatorMetadata.js'
import type { IndicatorSeriesResult } from './instances/domain/instanceModel.js'

export interface VisibleRange {
  start: number
  end: number
}

/** Renderer-compatible view of one instance calculation result. */
export function createInstanceSeriesEntry(result: IndicatorSeriesResult): Record<string, unknown> {
  const raw = result.series
  if (raw && typeof raw === 'object' && 'series' in (raw as Record<string, unknown>)) {
    return { ...(raw as Record<string, unknown>), params: result.params }
  }
  return {
    series: raw,
    params: result.params,
    ...(raw && typeof raw === 'object' && !Array.isArray(raw)
      ? { enabledPeriods: Object.keys(raw).map(Number) }
      : {}),
  }
}

/** Project one enabled indicator instance into its renderer state. */
export function composeInstanceRenderState(
  metadata: IndicatorMetadata,
  result: IndicatorSeriesResult,
  visibleRange: VisibleRange,
  timestamp: number,
): unknown {
  const entry = createInstanceSeriesEntry(result)
  if (metadata.mainPane?.composeRenderState) {
    return metadata.mainPane.composeRenderState(entry, visibleRange, timestamp)
  }
  if (metadata.visibleState?.compose) {
    return metadata.visibleState.compose({
      bundle: entry,
      visibleRange,
      timestamp,
      active: true,
    })
  }
  return undefined
}

/** 成交量副图的帧级渲染状态。 */
export interface VolumeRenderState {
  readonly timestamp: number
  readonly valueMin: number
  readonly valueMax: number
}

export function composeVolumeRenderState(
  data: ReadonlyArray<KLineData>,
  visibleRange: VisibleRange,
  timestamp: number,
): VolumeRenderState | null {
  let maxVolume = 0
  let minVolume = Infinity
  const end = Math.min(visibleRange.end, data.length)
  for (let index = visibleRange.start; index < end; index++) {
    const volume = data[index]?.volume
    if (volume === undefined || volume === null) continue
    maxVolume = Math.max(maxVolume, volume)
    minVolume = Math.min(minVolume, volume)
  }
  if (maxVolume === 0 || !Number.isFinite(minVolume)) return null
  const padding = Math.max(0.05, (maxVolume - minVolume) * 0.1)
  return { timestamp, valueMin: Math.max(0, minVolume - padding), valueMax: maxVolume + padding }
}

/** Compute a price range from one enabled main-pane instance. */
export function computeInstanceMainIndicatorPriceRange(
  metadata: IndicatorMetadata,
  result: IndicatorSeriesResult,
  visibleRange: VisibleRange,
): { min: number; max: number } | null {
  const compute = metadata.mainPane?.computePriceRange
  return compute ? compute(createInstanceSeriesEntry(result), visibleRange) : null
}
