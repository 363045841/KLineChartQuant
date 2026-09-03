import type {
  IndicatorRenderStateReader,
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import type { ColorTokens } from '../../../foundation/tokens/index'
import type { KLineData } from '../../../foundation/types/price'
import { calcSTOCHData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../../indicators/scheduler'
import type { STOCHRenderState } from '../../indicators/state/stochState'
import { createSTOCHStateKey, EMPTY_STOCH_STATE } from '../../indicators/state/stochState'
import { createPaddedPointVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { ChartDataViewId } from '../../state/modeState'

import { createStochScaleRendererPlugin } from './scale/stoch_scale'
import { createDashedLineRenderer } from './shared/dashedLines'
import { tryDrawLinesGpu } from '../linesViaRenderer'

type LinePoint = { x: number; y: number }

interface STOCHRendererOptions {
  /** 目标 pane ID（默认 'sub'） */
  paneId?: string
}

function getSTOCHStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn('[STOCHRenderer] Scheduler not available via service locator')
    return null
  }
  const meta = scheduler.getIndicatorMetadata('stoch')
  if (!meta) {
    console.warn("[STOCHRenderer] Indicator metadata for 'stoch' not found, skip rendering")
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

/**
 * 创建 KDJ 渲染器插件
 */
function createSTOCHRendererPlugin(options: STOCHRendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'sub' } = options
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getSTOCHStateKey(pluginHost, paneId)
  }

  // 线条点缓存
  let cachedKey = ''
  let cachedKPoints: LinePoint[] = []
  let cachedDPoints: LinePoint[] = []
  let cachedJPoints: LinePoint[] = []

  // 离屏 Canvas 缓存虚线背景线 (80/20)
  const dashedLines = createDashedLineRenderer()

  function clearLineCache() {
    cachedKey = ''
    cachedKPoints = []
    cachedDPoints = []
    cachedJPoints = []
  }

  function buildSTOCHCacheKey(
    range: { start: number; end: number },
    kLineCenters: number[],
    pane: RenderContext['pane'],
    params: STOCHRenderState['params'],
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
      params.showK,
      params.showD,
      params.showJ,
      params.n,
      params.m,
    ].join('|')
  }

  return {
    name: `stoch_${paneId}`,
    version: '2.1.0',
    description: 'KDJ 指标渲染器（WebGL + Canvas2D 回退）',
    debugName: 'KDJ',
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
      const { ctx, pane, range, scrollLeft, dpr, kLineCenters } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )

      const stateKey = resolveKey()
      if (!stateKey) return
      const state = context.indicatorStateReader?.get<STOCHRenderState>(stateKey)
      if (!state || state.visibleMin > state.visibleMax) {
        clearLineCache()
        return
      }

      const { valueMin, valueMax, params, series } = state

      const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
      const displayMin = displayRange.minPrice
      const displayMax = displayRange.maxPrice
      const displayValueRange = displayMax - displayMin || 1

      const paneWidth = context.paneWidth
      const paneHeight = pane.height
      dashedLines.render(ctx, paneWidth, paneHeight, displayMin, displayMax, dpr, colors.kdj.guide)

      // 确定绘制范围
      const drawStart = Math.max(range.start, params.n + params.m - 2)
      const drawEnd = Math.min(range.end, series.length)

      // 更新线条缓存
      const cacheKey = buildSTOCHCacheKey(range, kLineCenters, pane, params, state.timestamp)
      if (cachedKey !== cacheKey) {
        cachedKey = cacheKey

        const paneH = paneHeight
        const invRange = paneH / displayValueRange
        const rangeStart = range.start

        if (params.showK) {
          const points: LinePoint[] = []
          for (let i = drawStart; i < drawEnd; i++) {
            const point = series[i]
            if (!point) continue

            const centerX = kLineCenters[i - rangeStart]
            if (centerX === undefined) continue

            points.push({ x: centerX, y: paneH - (point.k - displayMin) * invRange })
          }
          cachedKPoints = points
        } else {
          cachedKPoints = []
        }

        if (params.showD) {
          const points: LinePoint[] = []
          for (let i = drawStart; i < drawEnd; i++) {
            const point = series[i]
            if (!point) continue

            const centerX = kLineCenters[i - rangeStart]
            if (centerX === undefined) continue

            points.push({ x: centerX, y: paneH - (point.d - displayMin) * invRange })
          }
          cachedDPoints = points
        } else {
          cachedDPoints = []
        }

        if (params.showJ) {
          const points: LinePoint[] = []
          for (let i = drawStart; i < drawEnd; i++) {
            const point = series[i]
            if (!point) continue

            const centerX = kLineCenters[i - rangeStart]
            if (centerX === undefined) continue

            points.push({ x: centerX, y: paneH - (point.j - displayMin) * invRange })
          }
          cachedJPoints = points
        } else {
          cachedJPoints = []
        }
      }

      // 绘制 KDJ 三线（WebGL 优先，Canvas2D 回退）
      const lines: Array<{ points: LinePoint[]; width: number; color: string }> = []
      if (params.showK && cachedKPoints.length >= 2) {
        lines.push({ points: cachedKPoints, width: 1, color: colors.kdj.k })
      }
      if (params.showD && cachedDPoints.length >= 2) {
        lines.push({ points: cachedDPoints, width: 1, color: colors.kdj.d })
      }
      if (params.showJ && cachedJPoints.length >= 2) {
        lines.push({ points: cachedJPoints, width: 1, color: colors.kdj.j })
      }
      if (!tryDrawLinesGpu(context, lines, scrollLeft)) {
        drawSTOCHLinesWithCanvas2D(
          ctx,
          scrollLeft,
          cachedKPoints,
          cachedDPoints,
          cachedJPoints,
          params,
          colors,
        )
      }
    },

    getConfig() {
      const stateKey = resolveKey()
      if (!stateKey) return {}
      const state = pluginHost
        ?.getService<IndicatorScheduler>('indicatorScheduler')
        ?.createRenderStateReader()
        .get<STOCHRenderState>(stateKey)
      return state?.params ?? {}
    },

    setConfig() {
      // no-op: 配置通过 scheduler.updateIndicatorConfig() 更新
    },
  }
}

/**
 * 使用 Canvas 2D 绘制 KDJ 线（WebGL 回退）
 */
function drawSTOCHLinesWithCanvas2D(
  ctx: CanvasRenderingContext2D,
  scrollLeft: number,
  kPoints: LinePoint[],
  dPoints: LinePoint[],
  jPoints: LinePoint[],
  params: { showK: boolean; showD: boolean; showJ: boolean },
  colors: { kdj: { k: string; d: string; j: string } },
): void {
  ctx.save()
  ctx.translate(-scrollLeft, 0)
  ctx.lineWidth = 1
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  if (params.showK && kPoints.length >= 2) {
    ctx.strokeStyle = colors.kdj.k
    ctx.beginPath()
    ctx.moveTo(kPoints[0]!.x, kPoints[0]!.y)
    for (let i = 1; i < kPoints.length; i++) {
      const point = kPoints[i]!
      ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
  }

  if (params.showD && dPoints.length >= 2) {
    ctx.strokeStyle = colors.kdj.d
    ctx.beginPath()
    ctx.moveTo(dPoints[0]!.x, dPoints[0]!.y)
    for (let i = 1; i < dPoints.length; i++) {
      const point = dPoints[i]!
      ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
  }

  if (params.showJ && jPoints.length >= 2) {
    ctx.strokeStyle = colors.kdj.j
    ctx.beginPath()
    ctx.moveTo(jPoints[0]!.x, jPoints[0]!.y)
    for (let i = 1; i < jPoints.length; i++) {
      const point = jPoints[i]!
      ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
  }

  ctx.restore()
}

/**
 * 获取 KDJ 标题信息（供 paneTitle 使用）
 */
function getSTOCHTitleInfo(
  _data: KLineData[],
  index: number | null,
  params: Record<string, number | boolean | string>,
  stateReader: IndicatorRenderStateReader,
  paneId: string,
  colors: ColorTokens,
): {
  name: string
  params: number[]
  values: Array<{ label: string; value: number; color: string }>
} | null {
  const n = (params.n as number) ?? 9
  const m = (params.m as number) ?? 3
  const title: {
    name: string
    params: number[]
    values: Array<{ label: string; value: number; color: string }>
  } = { name: '随机指标', params: [n, m], values: [] }
  if (index === null) return title

  const state = stateReader.get<STOCHRenderState>(createSTOCHStateKey(paneId))
  if (!state) return title

  const point = state.series[index]
  if (!point || point.k === undefined) return title

  const values = []
  if (state.params.showK) values.push({ label: 'K', value: point.k, color: colors.kdj.k })
  if (state.params.showD) values.push({ label: 'D', value: point.d, color: colors.kdj.d })
  if (state.params.showJ) values.push({ label: 'J', value: point.j, color: colors.kdj.j })

  return {
    ...title,
    values,
  }
}

@Indicator({
  name: 'stoch',
  displayName: 'KDJ',
  category: 'oscillator',
  indicatorType: 'momentum',
  defaultPaneId: 'sub_STOCH',
  dataViews: [ChartDataViewId.KLine, ChartDataViewId.TimeShare, ChartDataViewId.FiveDayTimeShare],
  visibleState: {
    compose: createPaddedPointVisibleStateComposer('stoch', EMPTY_STOCH_STATE, [
      'k',
      'd',
      'j',
    ] as const),
  },
  scaleRendererFactory: createStochScaleRendererPlugin,
  getTitleInfo: getSTOCHTitleInfo,
  presentation: { defaultOptions: { showK: true, showD: true, showJ: true } },
  runtime: {
    defaultParams: { n: 9, m: 3 },
    computeKey: 'calcSTOCHData',
    compute: (data, c) => calcSTOCHData(data, c.n, c.m),
  },
})
export class STOCHIndicatorDefinition {
  static rendererFactory = createSTOCHRendererPlugin
}
