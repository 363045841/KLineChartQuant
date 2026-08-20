import type {
  RendererPluginWithHost,
  PluginHost,
  RenderContext,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors, type ColorTokens } from '../../../foundation/tokens/index'
import type { KLineData } from '../../../foundation/types/price'
import { alignToPhysicalPixelCenter } from '../../../foundation/utils/pixelAlign'
import { calcBOLLData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type {
  IndicatorPriceRangeComputer,
  IndicatorRenderStateComposer,
  GetTitleInfoFn,
  TitleInfo,
  TitleValueItem,
} from '../../indicators/indicatorMetadata'
import type { BOLLSchedulerConfig, IndicatorScheduler } from '../../indicators/scheduler'
import { BOLL_STATE_KEY, type BOLLRenderState } from '../../indicators/state/bollState'

import { tryDrawLinesGpu } from '../linesViaRenderer'

type LinePoint = { x: number; y: number }

const BOLL_LINE_WIDTH = 1

interface PriceData {
  upper: number
  middle: number
  lower: number
}

/**
 * BOLL GPU：三轨折线；仅 sceneRenderer，失败返回 false 走 2D。
 */
function drawBOLLWithWebGL(
  context: RenderContext,
  data: {
    showUpper: boolean
    showMiddle: boolean
    showLower: boolean
    upperPoints: LinePoint[]
    middlePoints: LinePoint[]
    lowerPoints: LinePoint[]
  },
): boolean {
  const colors = resolveThemeColors(
    context.theme,
    context.isAsiaMarket,
    context.colorPresetSettings,
  )

  const lineStrips: Array<{ points: LinePoint[]; width: number; color: string }> = []
  if (data.showUpper && data.upperPoints.length >= 2) {
    lineStrips.push({ points: data.upperPoints, width: BOLL_LINE_WIDTH, color: colors.boll.upper })
  }
  if (data.showMiddle && data.middlePoints.length >= 2) {
    lineStrips.push({
      points: data.middlePoints,
      width: BOLL_LINE_WIDTH,
      color: colors.boll.middle,
    })
  }
  if (data.showLower && data.lowerPoints.length >= 2) {
    lineStrips.push({ points: data.lowerPoints, width: BOLL_LINE_WIDTH, color: colors.boll.lower })
  }

  if (lineStrips.length === 0) return false
  return tryDrawLinesGpu(context, lineStrips, context.scrollLeft)
}

function buildPriceCacheKey(
  range: { start: number; end: number },
  dataLength: number,
  lastTimestamp: number,
  period: number,
): string {
  return `${range.start}|${range.end}|${dataLength}|${lastTimestamp}|${period}`
}

function getBOLLStateKey(host: PluginHost | null): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn('[BOLLRenderer] Scheduler not available via service locator')
    return null
  }
  const meta = scheduler.getIndicatorMetadata('boll')
  if (!meta) {
    console.warn("[BOLLRenderer] Indicator metadata for 'boll' not found, skip rendering")
    return null
  }
  return resolveStateKey(meta.stateKey)
}

const computeBOLLPriceRange: IndicatorPriceRangeComputer = (bundle, range) => {
  const series = bundle.boll.series
  if (series.length === 0 || range.start >= series.length) {
    return null
  }

  let min = Infinity
  let max = -Infinity
  const end = Math.min(range.end, series.length)
  for (let i = range.start; i < end; i++) {
    const p = series[i]
    if (p) {
      min = Math.min(min, p.upper, p.middle, p.lower)
      max = Math.max(max, p.upper, p.middle, p.lower)
    }
  }

  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null
}

const composeBOLLRenderState: IndicatorRenderStateComposer = (
  bundle,
  range,
  timestamp,
): BOLLRenderState => {
  const priceRange = computeBOLLPriceRange(bundle, range) ?? { min: Infinity, max: -Infinity }
  return {
    timestamp,
    series: bundle.boll.series,
    params: bundle.boll.params,
    visibleMin: priceRange.min,
    visibleMax: priceRange.max,
  }
}

const getBOLLTitleInfo: GetTitleInfoFn = (
  _data: KLineData[],
  index: number | null,
  _params: Record<string, number | boolean | string>,
  stateReader,
  _paneId: string,
  colors: ColorTokens,
): TitleInfo | null => {
  if (index === null) return null

  const state = stateReader.get<BOLLRenderState>(BOLL_STATE_KEY)
  if (!state || state.visibleMin > state.visibleMax) return null

  const bollPoint = state.series[index]
  if (!bollPoint) return null

  const values: TitleValueItem[] = [
    { label: 'UP', value: bollPoint.upper, color: colors.boll.upper },
    { label: 'MID', value: bollPoint.middle, color: colors.boll.middle },
    { label: 'DN', value: bollPoint.lower, color: colors.boll.lower },
  ]

  return { name: 'BOLL', params: [state.params.period, state.params.multiplier], values }
}

@Indicator({
  name: 'boll',
  displayName: 'BOLL',
  category: 'main',
  indicatorType: 'channel',
  defaultPaneId: 'main',
  mainPane: {
    rendererName: 'boll',
    toActiveConfig: (params, active) =>
      active ? params : { ...params, showUpper: false, showMiddle: false, showLower: false },
    computePriceRange: computeBOLLPriceRange,
    composeRenderState: composeBOLLRenderState,
  },
  runtime: {
    defaultConfig: {
      period: 20,
      multiplier: 2,
      showUpper: true,
      showMiddle: true,
      showLower: true,
    },
    computeKey: 'calcBOLLData',
    compute: (data, c) => calcBOLLData(data, c.period, c.multiplier),
  },
  getTitleInfo: getBOLLTitleInfo,
})
export class BOLLDefinition {
  static rendererFactory = createBOLLRendererPlugin
}

export function createBOLLRendererPlugin(): RendererPluginWithHost {
  let pluginHost: PluginHost | null = null

  // 对象池：复用 {x,y} 对象，消除每帧 GC 压力
  const _upperPool: LinePoint[] = []
  const _middlePool: LinePoint[] = []
  const _lowerPool: LinePoint[] = []
  let _poolSize = 0

  function _growPool(size: number) {
    if (size <= _poolSize) return
    for (let i = _poolSize; i < size; i++) {
      _upperPool[i] = { x: 0, y: 0 }
      _middlePool[i] = { x: 0, y: 0 }
      _lowerPool[i] = { x: 0, y: 0 }
    }
    _poolSize = size
  }

  function resolveKey(): string | null {
    return getBOLLStateKey(pluginHost)
  }

  return {
    name: 'boll',
    version: '2.2.0',
    description: '布林带渲染器（无缓存优化）',
    debugName: 'BOLL布林带',
    paneId: 'main',
    priority: RENDERER_PRIORITY.INDICATOR,

    onInstall(host: PluginHost): void {
      pluginHost = host
    },

    getDeclaredNamespaces(): string[] {
      const key = resolveKey()
      return key ? [key] : []
    },

    draw(context: RenderContext) {
      const { ctx, pane, data, range, scrollLeft, dpr, kLineCenters } = context
      const klineData = data as KLineData[]
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )

      const stateKey = resolveKey()
      if (!stateKey) return
      const state = context.indicatorStateReader?.get<BOLLRenderState>(stateKey)
      if (!state || state.visibleMin > state.visibleMax || state.series.length === 0) {
        return
      }

      const { period, showUpper, showMiddle, showLower } = state.params
      const bollData = state.series

      if (klineData.length < period) return

      const drawStart = Math.max(range.start, period - 1)
      const drawEnd = Math.min(range.end, klineData.length)
      if (drawEnd <= drawStart) return

      // ====== 复用池对象，零分配构建点集 ======
      const rangeStart = range.start
      const priceToY = pane.yAxis.priceToY.bind(pane.yAxis)

      const pointCount = drawEnd - drawStart
      _growPool(pointCount)

      // 新数组作为 WebGL geoCache key（避免缓存命中旧数据）
      const upperPoints: LinePoint[] = new Array(pointCount)
      const middlePoints: LinePoint[] = new Array(pointCount)
      const lowerPoints: LinePoint[] = new Array(pointCount)

      let upperIdx = 0,
        middleIdx = 0,
        lowerIdx = 0

      for (let i = drawStart; i < drawEnd; i++) {
        const boll = bollData[i]
        if (!boll) continue

        const centerX = kLineCenters[i - rangeStart]
        if (centerX === undefined) continue

        // 坐标转换
        const upperY = alignToPhysicalPixelCenter(priceToY(boll.upper), dpr)
        const middleY = alignToPhysicalPixelCenter(priceToY(boll.middle), dpr)
        const lowerY = alignToPhysicalPixelCenter(priceToY(boll.lower), dpr)

        // 从池中取对象，只改坐标，零分配
        let p = _upperPool[upperIdx]
        p.x = centerX
        p.y = upperY
        upperPoints[upperIdx++] = p
        p = _middlePool[middleIdx]
        p.x = centerX
        p.y = middleY
        middlePoints[middleIdx++] = p
        p = _lowerPool[lowerIdx]
        p.x = centerX
        p.y = lowerY
        lowerPoints[lowerIdx++] = p
      }

      // 截断到实际长度
      upperPoints.length = upperIdx
      middlePoints.length = middleIdx
      lowerPoints.length = lowerIdx

      // ====== 渲染 ======
      if (
        drawBOLLWithWebGL(context, {
          showUpper,
          showMiddle,
          showLower,
          upperPoints,
          middlePoints,
          lowerPoints,
        })
      ) {
        return
      }

      // ====== Canvas 2D 回退（极少执行） ======
      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.lineWidth = BOLL_LINE_WIDTH
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'

      const drawLine = (points: LinePoint[], color: string) => {
        if (points.length < 2) return
        ctx.beginPath()
        ctx.strokeStyle = color
        ctx.moveTo(points[0].x, points[0].y)
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y)
        }
        ctx.stroke()
      }

      if (showUpper) drawLine(upperPoints, colors.boll.upper)
      if (showMiddle) drawLine(middlePoints, colors.boll.middle)
      if (showLower) drawLine(lowerPoints, colors.boll.lower)

      ctx.restore()
    },

    getConfig() {
      const stateKey = resolveKey()
      if (!stateKey) return {}
      const state = pluginHost
        ?.getService<IndicatorScheduler>('indicatorScheduler')
        ?.createRenderStateReader()
        .get<BOLLRenderState>(stateKey)
      return state ? { ...state.params } : {}
    },

    setConfig(_newConfig: Record<string, unknown>) {
      // 外部控制器应调用 chart.getIndicatorScheduler().updateIndicatorConfig()
    },
  }
}
