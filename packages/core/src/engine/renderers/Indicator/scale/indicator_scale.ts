import { paintAxisLabels, registerAxisLabel } from '@/engine/axisLabels/index.js'
import { calculateValueTickPositions } from '@/engine/utils/tickPosition.js'
import type {
  BaseIndicatorState,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { ScaleType } from '@/foundation/types/scaleType.js'
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
  /** 与 pane 一致的 Y 轴内边距；保留以兼容既有插件选项形状。 */
  yPaddingPx?: number
  scaleType?: ScaleType
  getCrosshair?: () => { y: number; price: number; activePaneId: string | null } | null
  formatTickLabel?: (value: number) => string
  formatCrosshairLabel?: (value: number) => string
  /** 该坐标轴绑定的指标实例身份。 */
  instanceId: string
}

export function createIndicatorScaleRendererPlugin(
  options: IndicatorScaleRendererOptions,
): RendererPluginWithHost {
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
  let pluginHost: PluginHost | null = null

  return {
    name: `${indicatorKey}Scale_${paneId}`,
    version: '1.0.0',
    description: `${label} 刻度渲染器`,
    debugName: `${label}刻度`,
    paneId,
    priority: RENDERER_PRIORITY.INDICATOR_SCALE,
    layer: 'overlay',

    onInstall(host: PluginHost) {
      pluginHost = host
    },

    draw(context: RenderContext) {
      const { yAxisCtx, pane, dpr } = context
      if (!yAxisCtx || !pluginHost) return

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

      const displayRange = pane.yAxis.getDisplayRange({
        minPrice: valueMin,
        maxPrice: valueMax,
      })

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
          kind: 'tick',
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
          kind: 'tag',
          text: formatCrosshair(displayPrice),
          pos: localY,
          origin: 0,
          variant: 'crosshair',
          bgColor: tokenColors.label.bg,
          textColor: tokenColors.label.text,
          fontSize: 12,
        })
      }

      paintAxisLabels(yAxisCtx, labels.labels, 'yRightStatic', {
        dpr,
        axisWidth: effectiveAxisWidth,
        axisHeight: pane.height,
      })
    },
  }
}
