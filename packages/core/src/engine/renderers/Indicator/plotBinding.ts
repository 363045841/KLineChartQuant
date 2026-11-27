/** 图表按定义的输出类型选择渲染和图例投影。 */
import type { IndicatorMetadata } from '../../indicators/indicatorMetadata.js'
import { plotRenderer } from '../../plots/impl/plotDefinition.js'
import { createPlotTitleInfo } from '../../plots/impl/plotTitleInfo.js'
import { isRenderableIndicator, type RenderableIndicator } from './types.js'

const createPlotRenderer = plotRenderer()

/** Plot 定义使用图表自带的渲染器，原生扩展由其图表入口提供。 */
export function resolveIndicatorRendering(definition: IndicatorMetadata): RenderableIndicator | undefined {
  if (definition.kind !== 'indicator') return undefined
  if (isRenderableIndicator(definition)) return definition
  if (!definition.plots) return undefined
  return { ...definition, rendererFactory: createPlotRenderer, getTitleInfo: createPlotTitleInfo(definition.displayName) }
}
