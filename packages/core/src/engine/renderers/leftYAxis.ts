import type { RendererPlugin, RenderContext } from '../../plugin'
import { RENDERER_PRIORITY, GLOBAL_PANE_ID } from '../../plugin'
import { resolveThemeColors } from '../../tokens'
import { drawCrosshairPriceLabel } from '../../utils/kLineDraw/axis'
import { roundToPhysicalPixel } from '../draw/pixelAlign'
import { getFont, setCanvasFont } from '../theme/fonts'
import { priceAtYForScaleType, type ScaleType } from '../utils/tickPosition'

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
      const { leftAxisCtx, pane, dpr, period } = context
      if (!leftAxisCtx) return

      const axisWidth = leftAxisCtx.canvas ? leftAxisCtx.canvas.width / dpr : 0
      if (axisWidth <= 0) return

      // 分时模式始终显示左轴（线性），不受设置约束
      if (period !== 'timeshare') {
        const leftType = context.settings?.leftAxisType as string | undefined
        if (!leftType || leftType === 'none') return
      }

      const tokenColors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )

      if (!pane.capabilities.showPriceAxisTicks) return

      const scaleType: ScaleType =
        period === 'timeshare'
          ? 'linear'
          : ((context.settings?.leftAxisType as ScaleType) ?? 'linear')
      const paneScaleType = pane.yAxis.getScaleType()

      if (!context.yAxisTicks) return

      leftAxisCtx.clearRect(0, 0, axisWidth, pane.height)

      const font = getFont(12)
      setCanvasFont(leftAxisCtx, font)
      leftAxisCtx.textBaseline = 'middle'
      leftAxisCtx.textAlign = 'center'
      leftAxisCtx.fillStyle = tokenColors.text.secondary

      const textX = roundToPhysicalPixel(axisWidth / 2, dpr)

      const needsOwnValues = scaleType !== paneScaleType
      const crosshairPriceRange = pane.yAxis.getDisplayRange()

      const formatTick =
        scaleType === 'percent'
          ? (v: number) => {
              const sign = v >= 0 ? '+' : ''
              return sign + v.toFixed(2) + '%'
            }
          : (v: number) => v.toFixed(2)

      for (const tick of context.yAxisTicks) {
        let displayValue: number
        if (needsOwnValues) {
          if (scaleType === 'percent') {
            displayValue = pane.yAxis.toPercent(tick.value)
          } else {
            const { minPrice, maxPrice } = crosshairPriceRange
            displayValue = priceAtYForScaleType(
              tick.y,
              minPrice,
              maxPrice,
              scaleType,
              pane.height,
              pane.yAxis.getPaddingTop(),
              pane.yAxis.getPaddingBottom(),
            )
          }
        } else {
          displayValue = tick.value
        }
        leftAxisCtx.fillText(formatTick(displayValue), textX, tick.y)
      }

      const crosshair = options.getCrosshair?.()
      if (!crosshair || crosshair.activePaneId !== pane.id || crosshair.price === null) return

      const isCrosshairPercent = scaleType === 'percent'
      const crosshairPrice = isCrosshairPercent
        ? pane.yAxis.toPercent(crosshair.price)
        : crosshair.price
      const crosshairLabelRange: { minPrice: number; maxPrice: number } = isCrosshairPercent
        ? (() => {
            const p = pane.yAxis.getDisplayPercentRange()
            return { minPrice: p.minPct, maxPrice: p.maxPct }
          })()
        : crosshairPriceRange
      const formatCrosshairPrice = isCrosshairPercent
        ? (v: number) => {
            const sign = v >= 0 ? '+' : ''
            return sign + v.toFixed(2) + '%'
          }
        : undefined

      drawCrosshairPriceLabel(
        leftAxisCtx,
        {
          x: 0,
          y: pane.top,
          width: axisWidth,
          height: pane.height,
          crosshairY: crosshair.y,
          priceRange: crosshairLabelRange,
          yPaddingPx: options.yPaddingPx,
          dpr,
          fontSize: 12,
          priceOffset: 0,
          price: crosshairPrice,
          formatPrice: formatCrosshairPrice,
        },
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
    },
  }
}
