/**
 * 实例渲染状态投影。
 *
 * 计算结果只按图表实例寻址；本模块刻意一次只接收一个实例结果，禁止重建按指标类型索引的结果包。
 * 展示配置不参与计算，只在投影时合入 renderer 读取的参数。
 */
import type { KLineData } from '../../foundation/types/price.js'
import type { IndicatorMetadata } from './indicatorMetadata.js'
import type { IndicatorSeriesResult } from './instances/domain/instanceModel.js'

export interface VisibleRange {
  start: number
  end: number
}

/** 计算结果条目：只含计算参数；价格范围等计算语义使用它，不受展示配置影响。 */
function toCalculationEntry(result: IndicatorSeriesResult): Record<string, unknown> {
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

/**
 * Renderer-compatible view of one instance calculation result.
 *
 * 展示配置合入 `params` 供 renderer 读取；声明了 `presentation.selectSeriesKeys` 的指标
 * 按展示配置过滤可见序列，并据此生成 `enabledPeriods`。
 */
export function createInstanceSeriesEntry(
  metadata: IndicatorMetadata,
  result: IndicatorSeriesResult,
  presentation: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    ...toCalculationEntry(result),
    params: { ...result.params, ...presentation },
  }
  const selectSeriesKeys = metadata.presentation?.selectSeriesKeys
  const series = entry.series
  if (!selectSeriesKeys || !series || typeof series !== 'object' || Array.isArray(series)) {
    return entry
  }
  const selectedKeys = new Set(selectSeriesKeys(result.params, presentation))
  return {
    ...entry,
    series: Object.fromEntries(
      Object.entries(series as Record<string, unknown>).filter(([key]) => selectedKeys.has(key)),
    ),
    enabledPeriods: [...selectedKeys].map(Number).filter(Number.isFinite),
  }
}

/** Project one enabled indicator instance into its renderer state. */
export function composeInstanceRenderState(
  metadata: IndicatorMetadata,
  result: IndicatorSeriesResult,
  presentation: Readonly<Record<string, unknown>>,
  visibleRange: VisibleRange,
  timestamp: number,
): unknown {
  const entry = createInstanceSeriesEntry(metadata, result, presentation)
  if (metadata.mainPane?.composeRenderState) {
    return metadata.mainPane.composeRenderState(entry, visibleRange, timestamp)
  }
  if (metadata.visibleState?.compose) {
    return metadata.visibleState.compose({
      entry,
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
  return compute ? compute(toCalculationEntry(result), visibleRange) : null
}
