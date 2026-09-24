import { resolveEffectiveAxisDisplay } from '../../foundation/config/axisSettings.js'
import type { RenderContext, RendererPlugin } from '../../foundation/plugin/index.js'
import { GLOBAL_PANE_ID, RENDERER_PRIORITY } from '../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../foundation/tokens/index.js'
import { paintAxisLabels, registerAxisLabel } from '../axisLabels/index.js'
import { formatAxisPriceValue } from './axisValueFormat.js'

type YAxisOptions = {
  axisWidth: number
  /** 与 pane 一致的 Y 轴内边距；保留以兼容既有插件选项形状。 */
  yPaddingPx?: number
  getCrosshair?: () => { y: number; price: number; activePaneId: string | null } | null
}

/** 右轴当前展示语义：分时强制价格，比较视图默认百分比 */
function resolveRightAxisDisplay(context: RenderContext) {
  return resolveEffectiveAxisDisplay('right', {
    period: context.period,
    comparisonActive: (context.comparisonSymbols?.length ?? 0) > 0,
    leftSetting: context.settings?.mainLeftAxisDisplaySetting,
    rightTypeSetting: context.settings?.mainRightAxisTypeSetting,
  })
}

/**
 * Y 轴静态层：刻度，画到 yAxisCtx（main 级刷新）
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
      const { ctx, pane, dpr, yAxisCtx } = context
      const axisDisplay = resolveRightAxisDisplay(context)
      if (axisDisplay === 'none') return

      const tokenColors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const targetCtx = yAxisCtx || ctx
      const axisWidth = yAxisCtx?.canvas ? yAxisCtx.canvas.width / dpr : options.axisWidth
      const isPercent = axisDisplay === 'percent' && pane.role === 'price'

      if (pane.capabilities.showPriceAxisTicks && context.yAxisTicks) {
        targetCtx.clearRect(0, 0, axisWidth, pane.height)

        const labels = context.axisLabels.forSurface('yRightStatic', pane.id)
        for (const tick of context.yAxisTicks) {
          const displayValue = isPercent ? pane.yAxis.toPercent(tick.value) : tick.value
          labels.register({
            kind: 'tick',
            text: formatAxisPriceValue(displayValue, isPercent),
            pos: tick.y,
            color: tokenColors.text.secondary,
            fontSize: 12,
          })
        }
        paintAxisLabels(targetCtx, labels.labels, 'yRightStatic', {
          dpr,
          axisWidth,
          axisHeight: pane.height,
        })
      }
    },
  }
}

/**
 * Y 轴动态层：价格范围带、装饰标签与十字线价签，画到 yAxisOverlayCtx（overlay 级刷新）
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
      const { pane, dpr, yAxisOverlayCtx, yAxisCtx } = context
      const axisDisplay = resolveRightAxisDisplay(context)
      if (axisDisplay === 'none') return

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

      const isPercent = axisDisplay === 'percent' && pane.role === 'price'

      // 绘图范围带在绘图 overlay 阶段注册，必须在同一 overlay 层绘制。
      if (pane.role === 'price') {
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

      // 十字线价签：在装饰标签之后注册，保证绘制顺序与既有 overlay 语义一致。
      const crosshair = options.getCrosshair?.()
      if (crosshair && crosshair.activePaneId === pane.id && crosshair.price !== null) {
        const crosshairPrice = isPercent ? pane.yAxis.toPercent(crosshair.price) : crosshair.price
        registerAxisLabel(context, 'yRightOverlay', {
          kind: 'tag',
          text: formatAxisPriceValue(crosshairPrice, isPercent),
          pos: crosshair.y,
          origin: pane.top,
          variant: 'crosshair',
          bgColor: tokenColors.label.bg,
          textColor: tokenColors.label.text,
          fontSize: 12,
        })
      }

      paintAxisLabels(
        targetCtx,
        context.axisLabels.forSurface('yRightOverlay', pane.id).labels,
        'yRightOverlay',
        { dpr, axisWidth, axisHeight: pane.height },
      )
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
