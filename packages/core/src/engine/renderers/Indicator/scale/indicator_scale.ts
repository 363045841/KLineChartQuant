/**
 * 通用指标坐标轴刻度 Layer 工厂。
 *
 * 一个轴一个刻度层；静态刻度与动态十字线价签分别绘制到右轴对应画布，
 * 轴范围与刻度类型来自 Pane 的派生轴，不再读取实例状态。
 */

import { paintAxisLabels, registerAxisLabel } from '@/engine/renderers/impl/labels/index.js'
import { calculateValueTickPositions } from '@/engine/scale/index.js'
import type { RenderContext } from '@/foundation/plugin/index.js'
import { AXIS_LABEL_KIND, RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { ScaleType } from '@/foundation/types/scaleType.js'
import type { Layer } from '@/rendering/scene/types.js'
import { createIndicatorRendererLayer } from '../shared/indicatorRendererLayer.js'
import { formatScaleValue, resolveAdaptiveDecimals } from './scaleFormat.js'

export interface IndicatorScaleLayerOptions {
  axisWidth: number
  paneId: string
  /** 框架派生的轴身份；一个轴只创建一个刻度层。 */
  axisId: string
  indicatorKey: string
  label: string
  decimals?: number
  scaleType?: ScaleType
  getCrosshair?: () => { y: number; price: number; activePaneId: string | null } | null
  formatTickLabel?: (value: number) => string
  formatCrosshairLabel?: (value: number) => string
}

const CROSSHAIR_LAYER_SUFFIX = ':crosshair'

/** 指标轴的静态层及随鼠标更新的独立动态层。 */
type IndicatorScaleLayer = Layer<RenderContext> & {
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

/** 构建静态刻度与动态标签，两者共享轴的格式化选项。 */
export function createIndicatorScaleLayer(
  options: IndicatorScaleLayerOptions,
): IndicatorScaleLayer {
  const {
    axisWidth,
    paneId,
    axisId,
    indicatorKey,
    decimals = 2,
    scaleType = ScaleType.Linear,
    getCrosshair,
    formatTickLabel,
    formatCrosshairLabel,
  } = options

  const staticLayer = createIndicatorRendererLayer({
    kind: 'draw-list',
    definitionId: indicatorKey,
    instanceId: axisId,
    part: 'scale',
    paneId,
    axisId,
    role: 'indicator',
    z: RENDERER_PRIORITY.INDICATOR_SCALE,
    draw(context) {
      const { yAxisCtx, pane, dpr } = context
      if (!yAxisCtx) return
      const axis = context.pane.axis(axisId)
      const layout = context.axisLayout?.[axisId]
      const effectiveAxisWidth =
        layout?.width ?? (yAxisCtx.canvas ? yAxisCtx.canvas.width / dpr : axisWidth)
      const offsetX = layout?.left ?? 0
      const displayRange = axis.getDisplayRange()
      const effectiveScaleType: ScaleType = axis.getScaleType() ?? scaleType
      const tokenColors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const effectiveDecimals = formatTickLabel
        ? decimals
        : resolveAdaptiveDecimals(displayRange, decimals)
      const formatValue =
        formatTickLabel ?? ((value: number) => formatScaleValue(value, effectiveDecimals))

      yAxisCtx.clearRect(offsetX, 0, effectiveAxisWidth, pane.height)
      const labels = context.axisLabels.forSurface('yRightStatic', axisId)
      const positions = calculateValueTickPositions({
        contentTop: axis.getContentTop(),
        contentBottom: axis.getContentBottom(),
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
        offsetX,
      })
    },
  })

  const crosshairLayer = createIndicatorRendererLayer({
    kind: 'draw-list',
    layerId: resolveIndicatorScaleCrosshairLayerId(staticLayer.id),
    paneId,
    axisId,
    role: 'overlay',
    z: RENDERER_PRIORITY.INDICATOR_SCALE,
    draw(context) {
      const { yAxisOverlayCtx, pane, dpr } = context
      if (!yAxisOverlayCtx) return
      const axis = context.pane.axis(axisId)
      const layout = context.axisLayout?.[axisId]
      const effectiveAxisWidth = layout?.width ?? yAxisOverlayCtx.canvas.width / dpr
      const offsetX = layout?.left ?? 0
      const crosshair = getCrosshair?.()
      if (crosshair && crosshair.activePaneId === pane.id) {
        const displayRange = axis.getDisplayRange()
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
        const yStart = axis.getContentTop()
        const yEnd = axis.getContentBottom()
        const clampedY = Math.min(Math.max(localY, yStart), yEnd)
        const displayPrice = axis.yToPrice(clampedY)
        const formatCrosshair = formatCrosshairLabel ?? formatValue
        registerAxisLabel(
          context,
          'yRightOverlay',
          {
            kind: AXIS_LABEL_KIND.TAG,
            text: formatCrosshair(displayPrice),
            pos: localY,
            origin: 0,
            variant: 'crosshair',
            bgColor: tokenColors.crosshairLabelBg,
            textColor: tokenColors.crosshairLabelText,
            fontSize: 12,
          },
          axisId,
        )
      }

      paintAxisLabels(
        yAxisOverlayCtx,
        context.axisLabels.forSurface('yRightOverlay', axisId).labels,
        'yRightOverlay',
        {
          dpr,
          axisWidth: effectiveAxisWidth,
          axisHeight: pane.height,
          offsetX,
        },
      )
    },
  })
  return Object.assign(staticLayer, { crosshairLayer })
}
