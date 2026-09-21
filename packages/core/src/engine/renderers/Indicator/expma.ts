import type {
  IndicatorRenderStateReader,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '../../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index.js'
import { type ColorTokens, resolveThemeColors } from '../../../foundation/tokens/index.js'
import type { KLineData } from '../../../foundation/types/price.js'
import { alignToPhysicalPixelCenter } from '../../../foundation/utils/pixelAlign.js'
import { calcEXPMAData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import type {
  GetTitleInfoFn,
  IndicatorPriceRangeComputer,
  IndicatorRenderStateComposer,
  TitleInfo,
  TitleValueItem,
} from '../../indicators/indicatorMetadata.js'
import { readIndicatorSeriesEntry } from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { EXPMARenderState } from '../../indicators/state/expmaState.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'

type LinePoint = { x: number; y: number }

function buildEXPMACacheKey(
  range: { start: number; end: number },
  kLineCenters: number[],
  pane: RenderContext['pane'],
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
  ].join('|')
}

interface EXPMARendererOptions {
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

const computeEXPMAPriceRange: IndicatorPriceRangeComputer = (bundle, range) => {
  const { series } = readIndicatorSeriesEntry(bundle, 'expma')
  if (series.length === 0 || range.start >= series.length) {
    return null
  }

  let min = Infinity
  let max = -Infinity
  const end = Math.min(range.end, series.length)
  for (let i = range.start; i < end; i++) {
    const p = series[i]
    if (p) {
      min = Math.min(min, p.fast, p.slow)
      max = Math.max(max, p.fast, p.slow)
    }
  }

  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null
}

const composeEXPMARenderState: IndicatorRenderStateComposer = (
  bundle,
  range,
  timestamp,
): EXPMARenderState => {
  const source = readIndicatorSeriesEntry(bundle, 'expma')
  const priceRange = computeEXPMAPriceRange(bundle, range) ?? { min: Infinity, max: -Infinity }
  return {
    timestamp,
    series: source.series,
    params: source.params,
    visibleMin: priceRange.min,
    visibleMax: priceRange.max,
  }
}

export function createEXPMARendererPlugin(
  options: EXPMARendererOptions = {},
): RendererPluginWithHost {
  const { instanceId } = options
  let pluginHost: PluginHost | null = null
  let cachedKey = ''
  let cachedFastPoints: LinePoint[] = []
  let cachedSlowPoints: LinePoint[] = []

  function clearCache() {
    cachedKey = ''
    cachedFastPoints = []
    cachedSlowPoints = []
  }

  return {
    name: 'expma',
    version: '2.1.0',
    description: 'EXPMA 指数平滑移动平均线渲染器（带绘制缓存）',
    debugName: 'EXPMA',
    paneId: 'main',
    priority: RENDERER_PRIORITY.INDICATOR,

    onInstall(host: PluginHost): void {
      pluginHost = host
    },

    getDeclaredNamespaces(): string[] {
      return instanceId ? [instanceId] : []
    },

    draw(context: RenderContext) {
      const { ctx, pane, data, range, scrollLeft, dpr, kLineCenters } = context
      const klineData = data as KLineData[]
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      if (!instanceId) return
      const state = context.indicatorStateReader?.get<EXPMARenderState>(instanceId)

      if (!state || state.visibleMin > state.visibleMax) {
        clearCache()
        return
      }
      if (state.series.length === 0 || klineData.length < 2) {
        clearCache()
        return
      }

      const expmaData = state.series
      const drawStart = range.start
      const drawEnd = Math.min(range.end, klineData.length)
      const cacheKey = buildEXPMACacheKey(range, kLineCenters, pane, state.timestamp)

      if (cachedKey !== cacheKey) {
        cachedKey = cacheKey
        cachedFastPoints = []
        cachedSlowPoints = []

        for (let i = drawStart; i < drawEnd; i++) {
          const expma = expmaData[i]
          if (!expma) continue

          const centerX = kLineCenters[i - range.start]
          if (centerX === undefined) continue

          cachedFastPoints.push({ x: centerX, y: pane.yAxis.priceToY(expma.fast) })
          cachedSlowPoints.push({ x: centerX, y: pane.yAxis.priceToY(expma.slow) })
        }
      }

      {
        const lines: Array<{ points: LinePoint[]; width: number; color: string }> = []
        if (cachedFastPoints.length >= 2) {
          lines.push({ points: cachedFastPoints, width: 1, color: colors.expma.fast })
        }
        if (cachedSlowPoints.length >= 2) {
          lines.push({ points: cachedSlowPoints, width: 1, color: colors.expma.slow })
        }
        if (tryDrawLinesGpu(context, lines, scrollLeft)) return
      }

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.lineWidth = 1
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'

      if (cachedFastPoints.length >= 2) {
        ctx.strokeStyle = colors.expma.fast
        ctx.beginPath()
        ctx.moveTo(cachedFastPoints[0]!.x, cachedFastPoints[0]!.y)
        for (let i = 1; i < cachedFastPoints.length; i++) {
          const point = cachedFastPoints[i]!
          ctx.lineTo(point.x, point.y)
        }
        ctx.stroke()
      }

      if (cachedSlowPoints.length >= 2) {
        ctx.strokeStyle = colors.expma.slow
        ctx.beginPath()
        ctx.moveTo(cachedSlowPoints[0]!.x, cachedSlowPoints[0]!.y)
        for (let i = 1; i < cachedSlowPoints.length; i++) {
          const point = cachedSlowPoints[i]!
          ctx.lineTo(point.x, point.y)
        }
        ctx.stroke()
      }

      ctx.restore()
    },

    getConfig() {
      if (!instanceId) return {}
      const state = pluginHost
        ?.getService<IndicatorRenderStateReader>(INDICATOR_INSTANCE_STATE_SERVICE)
        ?.get<EXPMARenderState>(instanceId)
      return state ? { ...state.params } : {}
    },

    setConfig(_newConfig: Record<string, unknown>) {},
  }
}

const getEXPMATitleInfo: GetTitleInfoFn = (
  _data: KLineData[],
  index: number | null,
  _params: Record<string, number | boolean | string>,
  stateReader,
  instanceId,
  _paneId: string,
  colors: ColorTokens,
): TitleInfo | null => {
  if (index === null) return null

  const state = stateReader.get<EXPMARenderState>(instanceId)
  if (!state || state.visibleMin > state.visibleMax) return null

  const expmaPoint = state.series[index]
  if (!expmaPoint) return null

  const values: TitleValueItem[] = [
    { label: 'FAST', value: expmaPoint.fast, color: colors.expma.fast },
    { label: 'SLOW', value: expmaPoint.slow, color: colors.expma.slow },
  ]

  return { name: 'EXPMA', params: [state.params.fastPeriod, state.params.slowPeriod], values }
}

@Indicator({
  name: 'expma',
  displayName: 'EXPMA',
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  mainPane: {
    rendererName: 'expma',
    toActiveConfig: (params, active) => (active ? params : null),
    computePriceRange: computeEXPMAPriceRange,
    composeRenderState: composeEXPMARenderState,
  },
  runtime: {
    defaultParams: { fastPeriod: 12, slowPeriod: 50 },
    computeKey: 'calcEXPMAData',
    compute: (data, c) => calcEXPMAData(data, c.fastPeriod, c.slowPeriod),
  },
  getTitleInfo: getEXPMATitleInfo,
})
export class EXPMADefinition {
  static rendererFactory = createEXPMARendererPlugin
}
