/** 实例输出投影：普通指标生成 Plot，领域指标使用明确的专用投影。 */
import type { ColorTokens } from '@/foundation/tokens/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { projectPlots } from '../plots/impl/projectPlots.js'
import type { VisibleRange } from '../viewport/viewport.js'
import type { IndicatorMetadata } from './indicatorMetadata.js'
import type { IndicatorSeriesResult } from './instances/domain/instanceModel.js'
import { identityIndicatorIndex } from './projection/impl/indicatorTimelineProjection.js'

/** 计算和展示数据只在此相交，渲染器不读取原始计算结果。 */
export function composeInstanceRenderState(
  metadata: IndicatorMetadata,
  result: IndicatorSeriesResult,
  presentation: Readonly<Record<string, unknown>>,
  visibleRange: VisibleRange,
  timestamp: number,
  colors: ColorTokens = resolveThemeColors('light', false),
  projectIndex: (index: number) => number = identityIndicatorIndex,
): unknown {
  if (result.error) return { kind: 'error', error: result.error }
  const params = { ...result.params, ...presentation }
  if (metadata.plots)
    return projectPlots(metadata.plots, result.series, params, visibleRange, timestamp, colors)
  return metadata.customState?.compose({ series: result.series, params }, visibleRange, timestamp, projectIndex)
}

/** 领域指标的主图范围；Plot 的范围直接由当前帧的 Plot 状态提供。 */
export function computeInstanceMainIndicatorPriceRange(
  metadata: IndicatorMetadata,
  result: IndicatorSeriesResult,
  visibleRange: VisibleRange,
): { min: number; max: number } | null {
  if (result.error) return null
  return (
    metadata.customState?.computePriceRange?.(
      { series: result.series, params: result.params },
      visibleRange,
    ) ?? null
  )
}
