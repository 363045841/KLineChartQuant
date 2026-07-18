import type { RendererPlugin, RenderContext } from '../../foundation/plugin/index'
import { RENDERER_PRIORITY, GLOBAL_PANE_ID } from '../../foundation/plugin/index'
import { resolveThemeColors } from '../../foundation/tokens/index'
import { drawCrosshairPriceLabel } from '../../foundation/utils/kLineDraw/axis'
import { roundToPhysicalPixel } from '../../foundation/utils/pixelAlign'
import { getFont, setCanvasFont } from '../../foundation/tokens/fonts'
import { priceAtYForScaleType, type ScaleType } from '../utils/tickPosition'

type LeftYAxisOptions = {
  axisWidth: number
  yPaddingPx: number
  getCrosshair?: () => { y: number; price: number; activePaneId: string | null } | null
}

function shouldShowLeftAxis(period: string, settings: RenderContext['settings']): boolean {
  if (period === 'timeshare') return true
  const leftType = settings?.leftAxisType as string | undefined
  return Boolean(leftType && leftType !== 'none')
}

/**
 * 左 Y 轴静态层：刻度，画到 leftAxisCtx（main 级刷新）
 */
export function createLeftYAxisStaticRendererPlugin(options: LeftYAxisOptions): RendererPlugin {
  return {
    name: 'leftYAxis',
    version: '2.0.0',
    description: '左侧Y轴价格刻度渲染器（静态）',
    debugName: '左侧Y轴刻度',
    paneId: GLOBAL_PANE_ID,
    priority: RENDERER_PRIORITY.SYSTEM_YAXIS,

    draw(context: RenderContext) {
      const { leftAxisCtx, pane, dpr, period } = context
      if (!leftAxisCtx) return
      if (!shouldShowLeftAxis(period, context.settings)) return
      if (!pane.capabilities.showPriceAxisTicks) return
      if (!context.yAxisTicks) return

      const axisWidth = leftAxisCtx.canvas ? leftAxisCtx.canvas.width / dpr : 0
      if (axisWidth <= 0) return

      const tokenColors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )

      const scaleType: ScaleType =
        period === 'timeshare'
          ? 'linear'
          : ((context.settings?.leftAxisType as ScaleType) ?? 'linear')
      const paneScaleType = pane.yAxis.getScaleType()

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
    },
  }
}

/**
 * 左 Y 轴动态层：十字线价签，画到 leftAxisOverlayCtx（overlay 级刷新）
 */
export function createLeftYAxisOverlayRendererPlugin(options: LeftYAxisOptions): RendererPlugin {
  return {
    name: 'leftYAxisOverlay',
    version: '2.0.0',
    description: '左侧Y轴动态标签渲染器',
    debugName: '左侧Y轴标签',
    paneId: GLOBAL_PANE_ID,
    priority: RENDERER_PRIORITY.SYSTEM_YAXIS + 1,
    layer: 'overlay',

    draw(context: RenderContext) {
      const { leftAxisOverlayCtx, leftAxisCtx, pane, dpr, period } = context
      if (!shouldShowLeftAxis(period, context.settings)) return

      const targetCtx = leftAxisOverlayCtx ?? leftAxisCtx
      if (!targetCtx) return

      const axisWidth = targetCtx.canvas ? targetCtx.canvas.width / dpr : 0
      if (axisWidth <= 0) return

      targetCtx.clearRect(0, 0, axisWidth, pane.height)

      const crosshair = options.getCrosshair?.()
      if (!crosshair || crosshair.activePaneId !== pane.id || crosshair.price === null) return

      const scaleType: ScaleType =
        period === 'timeshare'
          ? 'linear'
          : ((context.settings?.leftAxisType as ScaleType) ?? 'linear')
      const isCrosshairPercent = scaleType === 'percent'
      const crosshairPrice = isCrosshairPercent
        ? pane.yAxis.toPercent(crosshair.price)
        : crosshair.price
      const crosshairPriceRange = pane.yAxis.getDisplayRange()
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
        targetCtx,
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

/**
 * @deprecated 使用 createLeftYAxisStaticRendererPlugin + createLeftYAxisOverlayRendererPlugin
 */
export function createLeftYAxisRendererPlugin(options: LeftYAxisOptions): RendererPlugin {
  return createLeftYAxisStaticRendererPlugin(options)
}
