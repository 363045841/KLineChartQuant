/** Plot 指标的声明辅助：统一 Layer 工厂。 */
import type { IndicatorRendererOptions } from '@/engine/indicators/indicatorMetadata.js'
import { createPlotLayer } from './plotRenderer.js'

/** 构造绑定指标身份的通用 Plot Layer 工厂。 */
export function plotRenderer(definitionId: string) {
  return (options: IndicatorRendererOptions) =>
    createPlotLayer(definitionId, options.paneId, options)
}
