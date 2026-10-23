/** 实例输出统一投影为公共 Plot 状态，价格范围由同一绘图结果派生。 */
import type { ColorTokens } from '@/foundation/tokens/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { projectPlots } from '../plots/impl/projectPlots.js'
import type { VisibleRange } from '../viewport/viewport.js'
import type { IndicatorMetadata } from './indicatorMetadata.js'
import type { IndicatorSeriesResult } from './instances/domain/instanceModel.js'

/** 计算和展示数据只在此相交，渲染器不读取原始计算结果。 */
export function composeInstanceRenderState(
  metadata: IndicatorMetadata,
  result: IndicatorSeriesResult,
  presentation: Readonly<Record<string, unknown>>,
  visibleRange: VisibleRange,
  timestamp: number,
  colors: ColorTokens = resolveThemeColors('light', false),
): unknown {
  if (result.error) return { kind: 'error', error: result.error }
  const params = { ...result.params, ...presentation }
  // 仅提供计算端口的扩展可用于查询；未声明绘图就不生成渲染状态。
  if (!metadata.plots) return undefined
  return projectPlots(metadata.plots, result.series, params, visibleRange, timestamp, colors)
}
