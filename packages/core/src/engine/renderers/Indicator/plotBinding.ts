/**
 * Plot 指标的渲染绑定：图表侧在注册时把渲染器与标题投影附加到计算描述上。
 */
import type { IndicatorMetadata } from '../../indicators/indicatorMetadata.js'
import { plotRenderer } from '../../plots/impl/plotDefinition.js'
import { createPlotTitleInfo } from '../../plots/impl/plotTitleInfo.js'
import type { RenderableIndicator } from './types.js'

/**
 * 为 Plot 指标附加渲染绑定。
 *
 * @param metadata - 注册表中的计算描述
 * @param displayName - 指标显示名，标题投影按它生成
 * @returns 带渲染器的定义
 */
export function bindPlotRendering(
  metadata: IndicatorMetadata,
  displayName: string,
): RenderableIndicator {
  return {
    ...metadata,
    rendererFactory: plotRenderer(),
    getTitleInfo: createPlotTitleInfo(displayName),
  }
}
