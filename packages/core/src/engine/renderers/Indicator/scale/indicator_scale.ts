/**
 * 通用指标坐标轴刻度 Layer 工厂。
 *
 * 静态刻度与动态十字线价签分别绘制到右轴对应画布；
 * 状态经 `context.indicatorStateReader` 读取，不再持有 config。
 */

import { paintAxisLabels, registerAxisLabel } from '@/engine/renderers/impl/labels/index.js'
import { calculateValueTickPositions } from '@/engine/scale/index.js'
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

export interface IndicatorScaleLayerOptions {
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

const CROSSHAIR_LAYER_SUFFIX = ':crosshair'

/** 指标轴的静态层及随鼠标更新的独立动态层。 */
interface IndicatorScaleLayer extends Layer<RenderContext> {
  crosshairLayer: Layer<RenderContext>
}

/** 从静态轴身份派生动态层身份，供挂载与卸载共用。 */
export function resolveIndicatorScaleCrosshairLayerId(scaleLayerId: string): string {
  return `${scaleLayerId}${CROSSHAIR_LAYER_SUFFIX}`
}

/** 识别通用指标轴工厂提供的动态层，兼容独立实现的自定义轴。 */
export function hasIndicatorScaleCrosshairLayer(
  layer: Layer<RenderContext>,
): layer is IndicatorScaleLayer {
  return 'crosshairLayer' in layer
}

/** 构建静态刻度与动态标签，两者共享指标的格式化选项。 */
export function createIndicatorScaleLayer(
  options: IndicatorScaleLayerOptions,
): IndicatorScaleLayer {
  const {
    axisWidth,
    paneId,
    indicatorKey,
    decimals = 2,
    scaleType = ScaleType.Linear,
    getCrosshair,
    formatTickLabel,
    formatCrosshairLabel,
    instanceId,
  } = options

  const staticLayer = createIndicatorRendererLayer({
    definitionId: indicatorKey,
    part: 'scale',
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

      paintAxisLabels(yAxisCtx, labels.labels, 'yRightStatic', {
        dpr,
        axisWidth: effectiveAxisWidth,
        axisHeight: pane.height,
      })
    },
  })

  const crosshairLayer = createIndicatorRendererLayer({
    layerId: resolveIndicatorScaleCrosshairLayerId(staticLayer.id),
    paneId,
    role: 'overlay',
    z: RENDERER_PRIORITY.INDICATOR_SCALE,
    draw(context) {
      const { yAxisOverlayCtx, pane, dpr } = context
      if (!yAxisOverlayCtx) return
      const state = context.indicatorStateReader?.get<IndicatorScaleRenderState>(instanceId)
      if (!state) return
      const valueMin = state.valueMin ?? state.visibleMin
      const valueMax = state.valueMax ?? state.visibleMax
      if (!Number.isFinite(valueMin) || !Number.isFinite(valueMax)) return
      const crosshair = getCrosshair?.()
      if (crosshair && crosshair.activePaneId === pane.id) {
        const displayRange = pane.yAxis.getDisplayRange()
        const effectiveDecimals = formatTickLabel
          ? decimals
          : resolveAdaptiveDecimals(displayRange, decimals)
        const formatValue =
          formatTickLabel ?? ((value: number) => formatScaleValue(value, effectiveDecimals))
        const tokenColors = resolveThemeColors(
          context.theme,
          context.isAsiaMarket,
          context.colorPresetSettings,
        )
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

        registerAxisLabel(context, 'yRightOverlay', {
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

      paintAxisLabels(
        yAxisOverlayCtx,
        context.axisLabels.forSurface('yRightOverlay', pane.id).labels,
        'yRightOverlay',
        {
          dpr,
          axisWidth: yAxisOverlayCtx.canvas.width / dpr,
          axisHeight: pane.height,
        },
      )
    },
  })
  return Object.assign(staticLayer, { crosshairLayer })
}
