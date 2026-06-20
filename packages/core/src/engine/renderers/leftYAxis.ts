import type { RendererPlugin, RenderContext } from '../../plugin'
import { RENDERER_PRIORITY, GLOBAL_PANE_ID } from '../../plugin'
import { drawScaleTicks } from '../renderers/Indicator/scale/indicator_scale'
import { drawCrosshairPriceLabel } from '../../utils/kLineDraw/axis'
import { resolveThemeColors } from '../../tokens'

export function createLeftYAxisRendererPlugin(options: {
  axisWidth: number
  yPaddingPx: number
  getCrosshair?: () => { y: number; price: number; activePaneId: string | null } | null
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

      const crosshair = options.getCrosshair?.()
      if (!crosshair || crosshair.activePaneId !== pane.id || crosshair.price === null) return

      drawCrosshairPriceLabel(leftAxisCtx, {
        x: 0,
        y: pane.top,
        width: axisWidth,
        height: pane.height,
        crosshairY: crosshair.y,
        priceRange: pane.priceRange,
        yPaddingPx: options.yPaddingPx,
        dpr,
        fontSize: 12,
        priceOffset: 0,
        price: crosshair.price,
      }, context.theme, context.isAsiaMarket, context.colorPresetSettings)
    },
  }
}
