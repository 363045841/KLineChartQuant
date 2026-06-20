import type { RendererPlugin, RenderContext } from '../../plugin'
import { RENDERER_PRIORITY, GLOBAL_PANE_ID } from '../../plugin'
import { drawScaleTicks } from '../renderers/Indicator/scale/indicator_scale'
import { resolveThemeColors } from '../../tokens'

export function createLeftYAxisRendererPlugin(options: {
  axisWidth: number
  yPaddingPx: number
}): RendererPlugin {
  return {
    name: 'leftYAxis',
    version: '1.0.0',
    description: '左侧Y轴价格刻度渲染器',
    debugName: '左侧Y轴',
    paneId: GLOBAL_PANE_ID,
    priority: RENDERER_PRIORITY.SYSTEM_YAXIS,

    draw(context: RenderContext) {
      const { leftAxisCtx, pane, dpr } = context
      if (!leftAxisCtx) return

      const tokenColors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)
      const { minPrice, maxPrice } = pane.priceRange

      if (!pane.capabilities.showPriceAxisTicks) return

      const axisWidth = leftAxisCtx.canvas ? (leftAxisCtx.canvas.width / dpr) : options.axisWidth

      drawScaleTicks({
        tickColor: tokenColors.text.secondary,
        ctx: leftAxisCtx,
        dpr,
        axisWidth,
        height: pane.height,
        paddingTop: pane.yAxis.getPaddingTop(),
        paddingBottom: pane.yAxis.getPaddingBottom(),
        valueMin: minPrice,
        valueMax: maxPrice,
        isMain: true,
        decimals: 2,
        hideEdgeTicks: false,
        scaleType: 'linear',
        textAlign: 'center',
      })
    },
  }
}
