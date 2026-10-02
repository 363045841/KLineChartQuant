/**
 * 通用指标坐标轴刻度 Layer 工厂。
 *
 * 按实例投影的极值计算刻度与十字线价签，绘制到右轴静态画布；
 * 状态经 `context.indicatorStateReader` 读取，不再持有 config。
 */

import { paintAxisLabels, registerAxisLabel } from '@/engine/axisLabels/index.js'
import { calculateValueTickPositions } from '@/engine/utils/tickPosition.js'
import type { BaseIndicatorState, RenderContext } from '@/foundation/plugin/index.js'
import { AXIS_LABEL_KIND, RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { ScaleType } from '@/foundation/types/scaleType.js'
import type { Layer } from '@/rendering/scene/types.js'
import { createIndicatorRendererLayer } from '../shared/indicatorRendererLayer.js'
import { formatScaleValue, resolveAdaptiveDecimals } from './scaleFormat.js'

interface IndicatorScaleRenderState extends BaseIndicatorState {
  valueMin?: number
  valueMax?: number
  visibleMin?: number
  visibleMax?: number
}

export interface IndicatorScaleRendererOptions {
  axisWidth: number
  paneId: string
  indicatorKey: string
  label: string
  decimals?: number
  /** 与 pane 一致的 Y 轴内边距；保留以兼容既有工厂选项形状。 */
  yPaddingPx?: number
  scaleType?: ScaleType
  getCrosshair?: () => { y: number; price: number; activePaneId: string | null } | null
  formatTickLabel?: (value: number) => string
  formatCrosshairLabel?: (value: number) => string
  /** 该坐标轴绑定的指标实例身份。 */
  instanceId: string
}

export function createIndicatorScaleLayer(
  options: IndicatorScaleRendererOptions,
): Layer<RenderContext> {
  const {
    axisWidth,
    paneId,
    indicatorKey,
    label,
    decimals = 2,
    scaleType = ScaleType.Linear,
    getCrosshair,
    formatTickLabel,
    formatCrosshairLabel,
    instanceId,
  } = options

  return createIndicatorRendererLayer({
    name: `${indicatorKey}Scale_${paneId}`,
    paneId,
    role: 'indicator',
    z: RENDERER_PRIORITY.INDICATOR_SCALE,
    draw(context) {
      const { yAxisCtx, pane, dpr } = context
      if (!yAxisCtx) return

      const state = context.indicatorStateReader?.get<IndicatorScaleRenderState>(instanceId)
      if (!state) return

      const valueMin = state.valueMin ?? state.visibleMin
      const valueMax = state.valueMax ?? state.visibleMax
      if (
        typeof valueMin !== 'number' ||
        typeof valueMax !== 'number' ||
        !Number.isFinite(valueMin) ||
        !Number.isFinite(valueMax)
      )
        return

      const effectiveScaleType: ScaleType = pane.yAxis.getScaleType() ?? scaleType
      const effectiveAxisWidth = yAxisCtx.canvas ? yAxisCtx.canvas.width / dpr : axisWidth
      const tokenColors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )

      const displayRange = pane.yAxis.getDisplayRange()

      // 无自定义格式化时按显示范围自适应小数位，避免小量级指标刻度全部折叠为 ±0.00。
      const effectiveDecimals = formatTickLabel
        ? decimals
        : resolveAdaptiveDecimals(displayRange, decimals)
      const formatValue =
        formatTickLabel ?? ((value: number) => formatScaleValue(value, effectiveDecimals))

      yAxisCtx.clearRect(0, 0, effectiveAxisWidth, pane.height)
      const labels = context.axisLabels.forSurface('yRightStatic', pane.id)

      const positions = calculateValueTickPositions({
        height: pane.height,
        paddingTop: pane.yAxis.getPaddingTop(),
        paddingBottom: pane.yAxis.getPaddingBottom(),
        isMain: false,
        hideEdgeTicks: false,
        valueMin: displayRange.minPrice,
        valueMax: displayRange.maxPrice,
        scaleType: effectiveScaleType,
      })
      for (const { y, value } of positions) {
        labels.register({
          kind: AXIS_LABEL_KIND.TICK,
          text: formatValue(value),
          pos: y,
          color: tokenColors.text.secondary,
          fontSize: 12,
        })
      }

      const crosshair = getCrosshair?.()
      if (crosshair && crosshair.activePaneId === pane.id) {
        const localY = crosshair.y - pane.top
        const paddingTop = pane.yAxis.getPaddingTop()
        const paddingBottom = pane.yAxis.getPaddingBottom()
        const yStart = paddingTop
        const yEnd = Math.max(paddingTop, pane.height - paddingBottom)
        const viewH = Math.max(1, yEnd - yStart)
        const clampedY = Math.min(Math.max(localY, yStart), yEnd)
        const t = (clampedY - yStart) / viewH
        const displayPrice =
          displayRange.maxPrice - t * (displayRange.maxPrice - displayRange.minPrice)
        const formatCrosshair = formatCrosshairLabel ?? formatValue

        registerAxisLabel(context, 'yRightStatic', {
          kind: AXIS_LABEL_KIND.TAG,
          text: formatCrosshair(displayPrice),
          pos: localY,
          origin: 0,
          variant: 'crosshair',
          bgColor: tokenColors.crosshairLabelBg,
          textColor: tokenColors.crosshairLabelText,
          fontSize: 12,
        })
      }

      paintAxisLabels(yAxisCtx, labels.labels, 'yRightStatic', {
        dpr,
        axisWidth: effectiveAxisWidth,
        axisHeight: pane.height,
      })
    },
  })
}
