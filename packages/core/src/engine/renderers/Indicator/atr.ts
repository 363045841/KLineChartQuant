import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import { calcATRData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, ATRSchedulerConfig } from '../../indicators/scheduler'
import type { ATRRenderState } from '../../indicators/state/atrState'
import { createATRStateKey } from '../../indicators/state/atrState'
import { EMPTY_ATR_STATE } from '../../indicators/state/atrState'
import { createNonNegativeSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'

import { createAtrScaleRendererPlugin } from './scale/atr_scale'
import { createSingleLineTitleInfo } from './shared/titleInfo'
import { tryDrawLinesGpu } from '../linesViaRenderer'

type LinePoint = { x: number; y: number }

const ATR_COLOR = '#d97706'

interface ATRRendererOptions {
  paneId?: string
}

function getATRStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn(`[ATRRenderer] Scheduler not available via service locator`)
    return null
  }
  const meta = scheduler.getIndicatorMetadata('atr')
  if (!meta) {
    console.warn(`[ATRRenderer] Indicator metadata for 'atr' not found, skip rendering`)
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

function createATRRendererPlugin(options: ATRRendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'sub_ATR' } = options
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getATRStateKey(pluginHost, paneId)
  }

  let cachedKey = ''
  let cachedPoints: LinePoint[] = []

  function clearCache() {
    cachedKey = ''
    cachedPoints = []
  }

  function buildCacheKey(
    range: { start: number; end: number },
    kLineCenters: number[],
    pane: RenderContext['pane'],
    params: ATRRenderState['params'],
    stateTimestamp: number,
  ): string {
    const dr = pane.yAxis.getDisplayRange()
    return [
      stateTimestamp,
      range.start,
      range.end,
      kLineCenters.length,
      kLineCenters[0]?.toFixed(2) ?? 'n',
      kLineCenters[kLineCenters.length - 1]?.toFixed(2) ?? 'n',
      dr.maxPrice.toFixed(6),
      dr.minPrice.toFixed(6),
      pane.yAxis.getPriceOffset().toFixed(6),
      pane.yAxis.getScaleType(),
      pane.height.toFixed(2),
      params.showATR,
      params.period,
    ].join('|')
  }

  return {
    name: `atr_${paneId}`,
    version: '1.0.0',
    description: 'ATR 平均真实波幅渲染器（Wilder 平滑）',
    debugName: 'ATR',
    paneId: paneId,
    priority: RENDERER_PRIORITY.INDICATOR,

    onInstall(host: PluginHost) {
      pluginHost = host
    },

    getDeclaredNamespaces() {
      const key = resolveKey()
      return key ? [key] : []
    },

    draw(context: RenderContext) {
      const { ctx, pane, range, scrollLeft, kLineCenters } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const atrColor = colors.palette?.indicatorAtr ?? ATR_COLOR

      const stateKey = resolveKey()
      if (!stateKey) return
      const state = pluginHost?.getSharedState<ATRRenderState>(stateKey)
      if (!state || !state.params.showATR || state.visibleMin > state.visibleMax) {
        clearCache()
        return
      }

      const { valueMin, valueMax, params, series } = state
      const valueRange = valueMax - valueMin || 1

      const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
      const displayMin = displayRange.minPrice
      const displayMax = displayRange.maxPrice
      const displayValueRange = displayMax - displayMin || 1

      // 基线（ATR 最低永远 ≥ 0，画 0 线作为参考）
      const zeroY = pane.height - ((0 - displayMin) / displayValueRange) * pane.height

      ctx.save()
      ctx.translate(-scrollLeft, 0)

      // 零线使用主题 wmsrGrid token，避免硬编码颜色
      ctx.strokeStyle = colors.wmsrGrid
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(scrollLeft, zeroY)
      ctx.lineTo(scrollLeft + context.paneWidth, zeroY)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.restore()

      // 绘制范围
      const drawStart = Math.max(range.start, params.period - 1)
      const drawEnd = Math.min(range.end, series.length)

      const cacheKey = buildCacheKey(range, kLineCenters, pane, params, state.timestamp)
      if (cachedKey !== cacheKey) {
        cachedKey = cacheKey
        cachedPoints = []

        for (let i = drawStart; i < drawEnd; i++) {
          const value = series[i]
          if (value === undefined) continue
          const centerX = kLineCenters[i - range.start]
          if (centerX === undefined) continue

          const logicY = pane.height - ((value - displayMin) / displayValueRange) * pane.height
          cachedPoints.push({ x: centerX, y: logicY })
        }
      }

      if (
        !tryDrawLinesGpu(context, [{ points: cachedPoints, width: 1, color: atrColor }], scrollLeft)
      ) {
        drawWithCanvas2D(ctx, scrollLeft, cachedPoints, atrColor)
      }
    },

    getConfig() {
      const stateKey = resolveKey()
      if (!stateKey) return {}
      const state = pluginHost?.getSharedState<ATRRenderState>(stateKey)
      return state?.params ?? {}
    },

    setConfig() {
      // no-op: 配置通过 scheduler.updateIndicatorConfig() 更新
    },
  }
}

function drawWithCanvas2D(
  ctx: CanvasRenderingContext2D,
  scrollLeft: number,
  points: LinePoint[],
  atrColor: string,
): void {
  if (points.length < 2) return
  ctx.save()
  ctx.translate(-scrollLeft, 0)
  ctx.strokeStyle = atrColor
  ctx.lineWidth = 1
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(points[0]!.x, points[0]!.y)
  for (let i = 1; i < points.length; i++) {
    const point = points[i]!
    ctx.lineTo(point.x, point.y)
  }
  ctx.stroke()
  ctx.restore()
}

const getATRTitleInfo = createSingleLineTitleInfo({
  createStateKey: createATRStateKey,
  name: 'ATR',
  defaultPeriod: 14,
  color: ATR_COLOR,
})

@Indicator({
  name: 'atr',
  displayName: 'ATR',
  category: 'oscillator',
  indicatorType: 'volatility',
  defaultPaneId: 'sub_ATR',
  scaleRendererFactory: createAtrScaleRendererPlugin,
  visibleState: { compose: createNonNegativeSparseVisibleStateComposer('atr', EMPTY_ATR_STATE) },
  getTitleInfo: getATRTitleInfo,
  runtime: {
    defaultConfig: { period: 14, showATR: true },
    computeKey: 'calcATRData',
    compute: (data, c) => calcATRData(data, c.period),
  },
})
class ATRIndicatorDefinition {
  static rendererFactory = createATRRendererPlugin
}
