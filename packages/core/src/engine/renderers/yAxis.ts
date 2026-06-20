import type { RendererPlugin, RenderContext } from '../../plugin'
import { RENDERER_PRIORITY, GLOBAL_PANE_ID } from '../../plugin'
import { drawCrosshairPriceLabel, drawAxisPriceLabel } from '../../utils/kLineDraw/axis'
import { drawScaleTicks } from '../renderers/Indicator/scale/indicator_scale'
import { resolveThemeColors } from '../../tokens'

import type { KLineData } from '../../types/price'
import type { ScaleType } from '../utils/tickPosition'

/**
 * 创建 Y 轴渲染器插件
 * 按 pane capability 决定是否绘制刻度与价格标签
 */
export function createYAxisRendererPlugin(options: {
  axisWidth: number
  yPaddingPx: number
  getCrosshair?: () => { y: number; price: number; activePaneId: string | null } | null
}): RendererPlugin {
  return {
    name: 'yAxis',
    version: '1.0.0',
    description: 'Y轴价格刻度渲染器',
    debugName: 'Y轴',
    paneId: GLOBAL_PANE_ID,
    priority: RENDERER_PRIORITY.SYSTEM_YAXIS,

    draw(context: RenderContext) {
      const { ctx, pane, dpr, yAxisCtx, data, period } = context

      // 分时模式始终显示右轴，不受设置约束
      if (period !== 'timeshare') {
        const rightType = context.settings?.rightAxisType as string | undefined
        if (rightType === 'none') return
      }

      const tokenColors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)
      const scaleType = pane.yAxis.getScaleType()

      const targetCtx = yAxisCtx || ctx
      const axisWidth = yAxisCtx?.canvas ? (yAxisCtx.canvas.width / dpr) : options.axisWidth
      const displayRange = pane.yAxis.getDisplayRange(pane.priceRange)

      const isPercent = scaleType === 'percent' && pane.role === 'price'

      if (pane.capabilities.showPriceAxisTicks) {
        const tickValueMin = isPercent ? pane.yAxis.getDisplayPercentRange().minPct : displayRange.minPrice
        const tickValueMax = isPercent ? pane.yAxis.getDisplayPercentRange().maxPct : displayRange.maxPrice
        const formatLabel = isPercent
          ? (v: number) => {
              const sign = v >= 0 ? '+' : ''
              return sign + v.toFixed(2) + '%'
            }
          : undefined

        drawScaleTicks({
          tickColor: tokenColors.text.secondary,
          ctx: targetCtx,
          dpr,
          axisWidth,
          height: pane.height,
          paddingTop: pane.yAxis.getPaddingTop(),
          paddingBottom: pane.yAxis.getPaddingBottom(),
          valueMin: tickValueMin,
          valueMax: tickValueMax,
          isMain: true,
          decimals: 2,
          hideEdgeTicks: false,
          scaleType: isPercent ? 'percent' : scaleType,
          formatLabel,
        })
      }

      // 绘制价格范围带（先于标签，使标签覆盖在范围带之上）
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

      // 绘制来自 yAxisLabels 的标签（最新价格、极值点、绘图锚点等）
      if (context.yAxisLabels && pane.role === 'price') {
        for (const label of context.yAxisLabels) {
          if (label.price == null || !Number.isFinite(label.price)) continue
          const isLastPrice = label.type === 'lastPrice'
          drawAxisPriceLabel(targetCtx, {
            x: 0,
            y: pane.top,
            width: axisWidth,
            height: pane.height,
            priceY: label.y + pane.top,
            price: label.price,
            dpr,
            bgColor: label.style?.bgColor ?? 'rgba(0, 0, 0, 0.8)',
            borderColor: label.style?.borderColor,
            textColor: label.style?.textColor ?? '#ffffff',
            fontSize: isLastPrice ? 12 : 11,
          }, context.theme, context.isAsiaMarket, context.colorPresetSettings)
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

        drawCrosshairPriceLabel(targetCtx, {
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
        }, context.theme, context.isAsiaMarket, context.colorPresetSettings)
      }
    },
  }
}
