import { resolveEffectiveAxisDisplay } from '../../foundation/config/axisSettings.js'
import { makePluginLayerId } from '../../foundation/plugin/impl/rendererLayerId.js'
import type { RenderContext } from '../../foundation/plugin/index.js'
import { AXIS_LABEL_KIND, RENDERER_PRIORITY } from '../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../foundation/tokens/index.js'
import type { Layer } from '../../rendering/scene/types.js'
import { LAYER_PANE_GLOBAL } from '../../rendering/scene/types.js'
import { paintAxisLabels, registerAxisLabel } from '../axisLabels/index.js'
import { formatAxisPriceValue } from './axisValueFormat.js'

type LeftYAxisOptions = {
  axisWidth: number
  /** 与 pane 一致的 Y 轴内边距；保留以兼容既有插件选项形状。 */
  yPaddingPx?: number
  getCrosshair?: () => { y: number; price: number; activePaneId: string | null } | null
}

/** 左轴当前展示语义：分时强制百分比 */
function resolveLeftAxisDisplay(context: RenderContext) {
  return resolveEffectiveAxisDisplay('left', {
    period: context.period,
    comparisonActive: (context.comparisonSymbols?.length ?? 0) > 0,
    leftSetting: context.settings?.mainLeftAxisDisplaySetting,
    rightTypeSetting: context.settings?.mainRightAxisTypeSetting,
  })
}

/**
 * 左 Y 轴静态层：刻度，画到 leftAxisCtx（main 级刷新）
 */
export function createLeftYAxisStaticRendererLayer(
  options: LeftYAxisOptions,
): Layer<RenderContext> {
  return {
    id: makePluginLayerId('leftYAxis'),
    role: 'background',
    pane: LAYER_PANE_GLOBAL,
    z: RENDERER_PRIORITY.SYSTEM_YAXIS,
    visible: true,
    paint(context) {
      const { leftAxisCtx, pane, dpr } = context
      if (!leftAxisCtx) return
      const axisDisplay = resolveLeftAxisDisplay(context)
      if (axisDisplay === 'none') return
      if (!pane.capabilities.showPriceAxisTicks) return
      if (!context.yAxisTicks) return

      const axisWidth = leftAxisCtx.canvas ? leftAxisCtx.canvas.width / dpr : 0
      if (axisWidth <= 0) return

      const tokenColors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )

      leftAxisCtx.clearRect(0, 0, axisWidth, pane.height)

      const isPercent = axisDisplay === 'percent' && pane.role === 'price'
      const labels = context.axisLabels.forSurface('yLeftStatic', pane.id)
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
      paintAxisLabels(leftAxisCtx, labels.labels, 'yLeftStatic', {
        dpr,
        axisWidth,
        axisHeight: pane.height,
      })
    },
    dispose() {},
  }
}

/**
 * 左 Y 轴动态层：十字线价签，画到 leftAxisOverlayCtx（overlay 级刷新）
 */
export function createLeftYAxisOverlayRendererLayer(
  options: LeftYAxisOptions,
): Layer<RenderContext> {
  return {
    id: makePluginLayerId('leftYAxisOverlay'),
    role: 'overlay',
    pane: LAYER_PANE_GLOBAL,
    z: RENDERER_PRIORITY.SYSTEM_YAXIS + 1,
    visible: true,
    paint(context) {
      const { leftAxisOverlayCtx, leftAxisCtx, pane, dpr } = context
      const axisDisplay = resolveLeftAxisDisplay(context)
      if (axisDisplay === 'none') return

      const targetCtx = leftAxisOverlayCtx ?? leftAxisCtx
      if (!targetCtx) return

      const axisWidth = targetCtx.canvas ? targetCtx.canvas.width / dpr : 0
      if (axisWidth <= 0) return

      targetCtx.clearRect(0, 0, axisWidth, pane.height)

      const crosshair = options.getCrosshair?.()
      if (!crosshair || crosshair.activePaneId !== pane.id || crosshair.price === null) return

      const tokenColors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const isPercent = axisDisplay === 'percent'
      const crosshairPrice = isPercent ? pane.yAxis.toPercent(crosshair.price) : crosshair.price

      registerAxisLabel(context, 'yLeftOverlay', {
        kind: AXIS_LABEL_KIND.TAG,
        text: formatAxisPriceValue(crosshairPrice, isPercent),
        pos: crosshair.y,
        origin: pane.top,
        variant: 'crosshair',
        bgColor: tokenColors.label.bg,
        textColor: tokenColors.label.text,
        fontSize: 12,
      })
      paintAxisLabels(
        targetCtx,
        context.axisLabels.forSurface('yLeftOverlay', pane.id).labels,
        'yLeftOverlay',
        { dpr, axisWidth, axisHeight: pane.height },
      )
    },
    dispose() {},
  }
}
