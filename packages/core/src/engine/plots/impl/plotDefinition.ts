/** Plot 指标的声明辅助：统一 Layer 工厂和常用单线配置。 */
import type { IndicatorRendererOptions } from '@/engine/indicators/indicatorMetadata.js'
import type { IndicatorPlotDefinition, PlotSpec } from '../types.js'
import { createPlotLayer } from './plotRenderer.js'

/** 构造绑定指标身份的通用 Plot Layer 工厂。 */
export function plotRenderer(definitionId: string, paneId: string) {
  return (options: Partial<IndicatorRendererOptions> = {}) =>
    createPlotLayer(definitionId, paneId, options)
}

/** 单线指标只声明显示开关、颜色和数值范围。 */
export function singleLinePlots(
  spec: PlotSpec,
  range?: IndicatorPlotDefinition['range'],
): IndicatorPlotDefinition {
  return { series: [spec], range }
}
