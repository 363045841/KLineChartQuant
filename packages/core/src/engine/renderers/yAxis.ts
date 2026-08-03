import type { RendererPlugin, RenderContext } from '../../foundation/plugin/index'
import { RENDERER_PRIORITY, GLOBAL_PANE_ID } from '../../foundation/plugin/index'
import { resolveThemeColors } from '../../foundation/tokens/index'
import { drawCrosshairPriceLabel, drawAxisPriceLabel } from '../../foundation/utils/kLineDraw/axis'
import { roundToPhysicalPixel } from '../../foundation/utils/pixelAlign'
import { getFont, setCanvasFont } from '../../foundation/tokens/fonts'

type YAxisOptions = {
  axisWidth: number
  yPaddingPx: number
  getCrosshair?: () => { y: number; price: number; activePaneId: string | null } | null
}

function shouldShowRightAxis(period: string, settings: RenderContext['settings']): boolean {
  if (period === 'timeshare') return true
  const rightType = settings?.rightAxisType as string | undefined
  return rightType !== 'none'
}

/**
 * Y 轴静态层：刻度 + 价格范围带，画到 yAxisCtx（main 级刷新）
 */
export function createYAxisStaticRendererPlugin(options: YAxisOptions): RendererPlugin {
  return {
    name: 'yAxis',
    version: '2.0.0',
    description: 'Y轴价格刻度渲染器（静态）',
    debugName: 'Y轴刻度',
    paneId: GLOBAL_PANE_ID,
    priority: RENDERER_PRIORITY.SYSTEM_YAXIS,

    draw(context: RenderContext) {
      const { ctx, pane, dpr, yAxisCtx, period } = context
      if (!shouldShowRightAxis(period, context.settings)) return

      const tokenColors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const scaleType = pane.yAxis.getScaleType()
      const targetCtx = yAxisCtx || ctx
      const axisWidth = yAxisCtx?.canvas ? yAxisCtx.canvas.width / dpr : options.axisWidth
      const isPercent = scaleType === 'percent' && pane.role === 'price'

      if (pane.capabilities.showPriceAxisTicks && context.yAxisTicks) {
        targetCtx.clearRect(0, 0, axisWidth, pane.height)

        const font = getFont(12)
        setCanvasFont(targetCtx, font)
        targetCtx.textBaseline = 'middle'
        targetCtx.textAlign = 'center'
        targetCtx.fillStyle = tokenColors.text.secondary

        const format = isPercent
          ? (v: number) => {
              const sign = v >= 0 ? '+' : ''
              return sign + v.toFixed(2) + '%'
            }
          : (v: number) => v.toFixed(2)

        const textX = roundToPhysicalPixel(axisWidth / 2, dpr)

        for (const tick of context.yAxisTicks) {
          const displayValue = isPercent ? pane.yAxis.toPercent(tick.value) : tick.value
          targetCtx.fillText(format(displayValue), textX, tick.y)
        }
      }

      // 价格范围带（先于标签，使标签覆盖在范围带之上）
      if (context.yAxisRanges && pane.role === 'price') {
        for (const range of context.yAxisRanges) {
          const topY = range.topY + pane.top
          const bandHeight = range.bottomY - range.topY
          if (bandHeight <= 0) continue
          targetCtx.save()
          targetCtx.globalAlpha = range.opacity
          targetCtx.fillStyle = range.color
          targetCtx.fillRect(0, topY, axisWidth, bandHeight)
          targetCtx.restore()
        }
      }
    },
  }
}

/**
 * Y 轴动态层：yAxisLabels + 十字线价签，画到 yAxisOverlayCtx（overlay 级刷新）
 */
export function createYAxisOverlayRendererPlugin(options: YAxisOptions): RendererPlugin {
  return {
    name: 'yAxisOverlay',
    version: '2.0.0',
    description: 'Y轴动态标签渲染器',
    debugName: 'Y轴标签',
    paneId: GLOBAL_PANE_ID,
    priority: RENDERER_PRIORITY.SYSTEM_YAXIS + 1,
    layer: 'overlay',

    draw(context: RenderContext) {
      const { pane, dpr, yAxisOverlayCtx, yAxisCtx, period } = context
      if (!shouldShowRightAxis(period, context.settings)) return

      const targetCtx = yAxisOverlayCtx ?? yAxisCtx
      if (!targetCtx) return

      // 标签默认底色/文字色统一取自 theme tokens，与静态层一致
      const tokenColors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )

      const axisWidth = targetCtx.canvas ? targetCtx.canvas.width / dpr : options.axisWidth
      targetCtx.clearRect(0, 0, axisWidth, pane.height)

      const scaleType = pane.yAxis.getScaleType()
      const displayRange = pane.yAxis.getDisplayRange(pane.priceRange)
      const isPercent = scaleType === 'percent' && pane.role === 'price'

      // 绘制来自 yAxisLabels 的标签（最新价格、极值点、绘图锚点等）
      if (context.yAxisLabels && pane.role === 'price') {
        for (const label of context.yAxisLabels) {
          if (label.price == null || !Number.isFinite(label.price)) continue
          const isLastPrice = label.type === 'lastPrice'
          drawAxisPriceLabel(
            targetCtx,
            {
              x: 0,
              y: pane.top,
              width: axisWidth,
              height: pane.height,
              priceY: label.y + pane.top,
              price: label.price,
              dpr,
              bgColor: label.style?.bgColor ?? tokenColors.label.bg,
              borderColor: label.style?.borderColor,
              textColor: label.style?.textColor ?? tokenColors.label.text,
              fontSize: isLastPrice ? 12 : 11,
            },
            context.theme,
            context.isAsiaMarket,
            context.colorPresetSettings,
          )
        }
      }

      const crosshair = options.getCrosshair?.()
      if (crosshair && crosshair.activePaneId === pane.id && crosshair.price !== null) {
        const crosshairPrice = isPercent ? pane.yAxis.toPercent(crosshair.price) : crosshair.price
        const crosshairPriceRange: { minPrice: number; maxPrice: number } = isPercent
          ? (() => {
              const p = pane.yAxis.getDisplayPercentRange()
              return { minPrice: p.minPct, maxPrice: p.maxPct }
            })()
          : displayRange
        const formatPrice = isPercent
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
            priceRange: crosshairPriceRange,
            yPaddingPx: options.yPaddingPx,
            dpr,
            fontSize: 12,
            priceOffset: 0,
            price: crosshairPrice,
            formatPrice,
          },
          context.theme,
          context.isAsiaMarket,
          context.colorPresetSettings,
        )
      }
    },
  }
}

/**
 * @deprecated 使用 createYAxisStaticRendererPlugin + createYAxisOverlayRendererPlugin
 * 保留兼容：静态+动态合画到 yAxisCtx
 */
export function createYAxisRendererPlugin(options: YAxisOptions): RendererPlugin {
  return createYAxisStaticRendererPlugin(options)
}
