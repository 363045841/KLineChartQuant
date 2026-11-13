/** 价格轴刻度、范围带与十字线价签的静态和动态绘制。 */

import { primitiveSink } from '@/rendering/primitives/impl/paint.js'
import { AXIS_DISPLAY } from '../../foundation/config/axisSettings.js'
import { makePluginLayerId } from '../../foundation/plugin/impl/rendererLayerId.js'
import type { RenderContext } from '../../foundation/plugin/index.js'
import { AXIS_LABEL_KIND, RENDERER_PRIORITY } from '../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../foundation/tokens/index.js'
import { isTimeSharePeriod } from '../../foundation/types/chartPeriod.js'
import type { Layer } from '../../rendering/scene/types.js'
import { LAYER_PANE_GLOBAL } from '../../rendering/scene/types.js'
import {
  formatAxisPriceValue,
  resolvePriceAxisDisplay,
  usesPercentAxis,
} from './axisValueFormat.js'
import { paintAxisLabels, registerAxisLabel } from './impl/labels/index.js'

type YAxisOptions = {
  axisWidth: number
  getCrosshair?: () => { y: number; price: number; activePaneId: string | null } | null
}

/**
 * Y 轴静态层：刻度，画到 yAxisCtx（main 级刷新）
 */
export function createYAxisStaticRendererLayer(options: YAxisOptions): Layer<RenderContext> {
  return {
    kind: 'draw-list',
    id: makePluginLayerId('yAxis'),
    role: 'background',
    pane: LAYER_PANE_GLOBAL,
    z: RENDERER_PRIORITY.SYSTEM_YAXIS,
    visible: true,
    paint(context) {
      const { pane, dpr, yAxisCtx } = context
      if (resolvePriceAxisDisplay(context) === AXIS_DISPLAY.NONE) return

      const tokenColors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const targetCtx = yAxisCtx
      if (!targetCtx) return
      const layout = context.axisLayout?.[pane.id]
      const axisWidth =
        layout?.width ?? (yAxisCtx?.canvas ? yAxisCtx.canvas.width / dpr : options.axisWidth)
      const offsetX = layout?.left ?? 0
      const isPercent = usesPercentAxis(context)

      if (
        (pane.capabilities.showPriceAxisTicks || context.hasPriceSeries === true) &&
        context.yAxisTicks
      ) {
        targetCtx.clearRect(offsetX, 0, axisWidth, pane.height)

        const labels = context.axisLabels.forSurface('yRightStatic', pane.id)
        for (const tick of context.yAxisTicks) {
          const displayValue = isPercent ? pane.yAxis.toPercent(tick.value) : tick.value
          labels.register({
            kind: AXIS_LABEL_KIND.TICK,
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
          offsetX,
        })
        // 分时左右轴共用刻度坐标，左侧直接显示对应的原始价格。
        const leftCtx = context.leftAxisCtx
        if (leftCtx && isTimeSharePeriod(context.period) && pane.role === 'price') {
          const leftWidth = leftCtx.canvas.width / dpr
          const leftLabels = context.axisLabels.forSurface('yLeftStatic', pane.id)
          for (const tick of context.yAxisTicks) {
            leftLabels.register({
              kind: AXIS_LABEL_KIND.TICK,
              text: formatAxisPriceValue(tick.value, false),
              pos: tick.y,
              color: tokenColors.text.secondary,
              fontSize: 12,
            })
          }
          paintAxisLabels(leftCtx, leftLabels.labels, 'yLeftStatic', {
            dpr,
            axisWidth: leftWidth,
            axisHeight: pane.height,
          })
        }
      }
    },
    dispose() {},
  }
}

/**
 * Y 轴动态层：价格范围带、装饰标签与十字线价签，画到 yAxisOverlayCtx（overlay 级刷新）
 */
export function createYAxisOverlayRendererLayer(options: YAxisOptions): Layer<RenderContext> {
  return {
    kind: 'draw-list',
    id: makePluginLayerId('yAxisOverlay'),
    role: 'overlay',
    pane: LAYER_PANE_GLOBAL,
    z: RENDERER_PRIORITY.SYSTEM_YAXIS + 1,
    visible: true,
    paint(context) {
      const { pane, dpr, yAxisOverlayCtx, yAxisCtx } = context
      if (resolvePriceAxisDisplay(context) === AXIS_DISPLAY.NONE) return

      const targetCtx = yAxisOverlayCtx ?? yAxisCtx
      if (!targetCtx) return

      // 标签默认底色/文字色统一取自 theme tokens，与静态层一致
      const tokenColors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )

      const layout = context.axisLayout?.[pane.id]
      const axisWidth =
        layout?.width ?? (targetCtx.canvas ? targetCtx.canvas.width / dpr : options.axisWidth)
      const offsetX = layout?.left ?? 0
      targetCtx.clearRect(offsetX, 0, axisWidth, pane.height)

      const isPercent = usesPercentAxis(context)

      // 绘图范围带在绘图 overlay 阶段注册，必须在同一 overlay 层绘制。
      if (context.hasPriceSeries === true) {
        for (const range of context.yAxisRanges) {
          const topY = range.topY + pane.top
          const bandHeight = range.bottomY - range.topY
          if (bandHeight <= 0) continue
          primitiveSink()(
            targetCtx,
            [
              {
                kind: 'fill',
                paths: [
                  [
                    { x: offsetX, y: topY },
                    { x: offsetX + axisWidth, y: topY },
                    { x: offsetX + axisWidth, y: topY + bandHeight },
                    { x: offsetX, y: topY + bandHeight },
                  ],
                ],
                color: range.color,
                opacity: range.opacity,
              },
            ],
            dpr,
          )
        }
      }

      // 十字线价签：在装饰标签之后注册，保证绘制顺序与既有 overlay 语义一致。
      const crosshair = options.getCrosshair?.()
      if (
        context.hasPriceSeries === true &&
        crosshair &&
        crosshair.activePaneId === pane.id &&
        crosshair.price !== null
      ) {
        const crosshairPrice = isPercent ? pane.yAxis.toPercent(crosshair.price) : crosshair.price
        registerAxisLabel(context, 'yRightOverlay', {
          kind: AXIS_LABEL_KIND.TAG,
          text: formatAxisPriceValue(crosshairPrice, isPercent),
          pos: crosshair.y,
          origin: pane.top,
          variant: 'crosshair',
          bgColor: tokenColors.crosshairLabelBg,
          textColor: tokenColors.crosshairLabelText,
          fontSize: 12,
        })
        const leftCtx = context.leftAxisOverlayCtx
        if (leftCtx && isTimeSharePeriod(context.period) && pane.role === 'price') {
          registerAxisLabel(context, 'yLeftOverlay', {
            kind: AXIS_LABEL_KIND.TAG,
            text: formatAxisPriceValue(crosshair.price, false),
            pos: crosshair.y,
            origin: pane.top,
            variant: 'crosshair',
            bgColor: tokenColors.crosshairLabelBg,
            textColor: tokenColors.crosshairLabelText,
            fontSize: 12,
          })
          paintAxisLabels(
            leftCtx,
            context.axisLabels.forSurface('yLeftOverlay', pane.id).labels,
            'yLeftOverlay',
            { dpr, axisWidth: leftCtx.canvas.width / dpr, axisHeight: pane.height },
          )
        }
      }

      paintAxisLabels(
        targetCtx,
        context.axisLabels.forSurface('yRightOverlay', pane.id).labels,
        'yRightOverlay',
        { dpr, axisWidth, axisHeight: pane.height, offsetX },
      )
    },
    dispose() {},
  }
}
