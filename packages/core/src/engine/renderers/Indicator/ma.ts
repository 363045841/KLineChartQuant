import type { IndicatorRenderStateReader, RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import type { ColorTokens } from '@/foundation/tokens/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import type { KLineData } from '@/foundation/types/price.js'
import { alignToPhysicalPixelCenter } from '@/foundation/utils/pixelAlign.js'
import type { Layer } from '@/rendering/scene/types.js'
import { calcMAData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import type {
  IndicatorPriceRangeComputer,
  IndicatorRenderStateComposer,
  TitleInfo,
  TitleValueItem,
} from '../../indicators/indicatorMetadata.js'
import { IndicatorKind, readIndicatorSeriesEntry } from '../../indicators/indicatorMetadata.js'
import type { MARenderState } from '../../indicators/state/maState.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'
import { createIndicatorRendererLayer } from './shared/indicatorRendererLayer.js'

// Re-export MAFlags from calculators for backward compatibility
export type { MAFlags } from '../../indicators/calculators/index.js'

type LinePoint = { x: number; y: number }

const computeMAPriceRange: IndicatorPriceRangeComputer = (bundle, range) => {
  const { series } = readIndicatorSeriesEntry(bundle, 'ma')
  const seriesList = Object.values(series)
  if (seriesList.length === 0 || range.start >= seriesList[0]!.length) {
    return null
  }

  let min = Infinity
  let max = -Infinity
  for (const values of seriesList) {
    const end = Math.min(range.end, values.length)
    for (let i = range.start; i < end; i++) {
      const v = values[i]
      if (v !== undefined) {
        min = Math.min(min, v)
        max = Math.max(max, v)
      }
    }
  }

  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null
}

const composeMARenderState: IndicatorRenderStateComposer = (
  bundle,
  range,
  timestamp,
): MARenderState => {
  const source = readIndicatorSeriesEntry(bundle, 'ma')
  const priceRange = computeMAPriceRange(bundle, range) ?? { min: Infinity, max: -Infinity }
  return {
    timestamp,
    series: source.series,
    enabledPeriods: source.enabledPeriods,
    visibleMin: priceRange.min,
    visibleMax: priceRange.max,
  }
}

function buildMACacheKey(
  range: { start: number; end: number },
  kLineCenters: number[],
  pane: RenderContext['pane'],
  enabledPeriods: number[],
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
    enabledPeriods.join(','),
    pane.height.toFixed(2),
  ].join('|')
}

function getMATitleInfo(
  _data: KLineData[],
  index: number | null,
  _params: Record<string, number | boolean | string>,
  stateReader: IndicatorRenderStateReader,
  instanceId: string,
  _paneId: string,
  colors: ColorTokens,
): TitleInfo | null {
  if (index === null) return null

  const state = stateReader.get<MARenderState>(instanceId)
  if (!state || state.visibleMin > state.visibleMax) return null

  const maColors: Record<number, string> = {
    5: colors.ma.ma5,
    10: colors.ma.ma10,
    20: colors.ma.ma20,
    30: colors.ma.ma30,
    60: colors.ma.ma60,
  }

  const values: TitleValueItem[] = []
  for (const period of state.enabledPeriods) {
    const series = state.series[period]
    const value = series?.[index]
    if (value === undefined) continue

    values.push({
      label: `MA${period}`,
      value,
      color: maColors[period] ?? colors.ma.ma5,
    })
  }

  return { name: 'MA', params: [], values }
}

@Indicator({
  name: 'ma',
  displayName: 'MA',
  kind: IndicatorKind.Indicator,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  mainPane: {
    toActiveConfig: (_params, active) => ({
      ma5: active,
      ma10: active,
      ma20: active,
      ma30: active,
      ma60: active,
    }),
    computePriceRange: computeMAPriceRange,
    composeRenderState: composeMARenderState,
  },
  presentation: {
    defaultOptions: { ma5: true, ma10: true, ma20: true, ma30: true, ma60: true },
    selectSeriesKeys: (params, options) =>
      Object.values(params)
        .filter((period): period is number => typeof period === 'number')
        .filter((period) => options[`ma${period}` as keyof typeof options])
        .map(String),
  },
  runtime: {
    defaultParams: { period1: 5, period2: 10, period3: 20, period4: 30, period5: 60 },
    computeKey: 'calcMAData',
    compute: (data, c) => {
      const r: Record<number, (number | undefined)[]> = {}
      for (const period of Object.values(c) as number[]) r[period] = calcMAData(data, period)
      return r
    },
  },
  getTitleInfo: getMATitleInfo,
})
export class MADefinition {
  static rendererFactory = createMALayer
}

export function createMALayer(options: { instanceId?: string } = {}): Layer<RenderContext> {
  const { instanceId } = options
  let cachedKey = ''
  let cachedLines = new Map<number, LinePoint[]>()

  function clearCache() {
    cachedKey = ''
    cachedLines = new Map()
  }

  return createIndicatorRendererLayer({
    definitionId: 'ma',
    paneId: 'main',
    z: RENDERER_PRIORITY.INDICATOR,
    draw(context) {
      const { ctx, pane, range, scrollLeft, dpr, kLineCenters } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const maColors: Record<number, string> = {
        5: colors.ma.ma5,
        10: colors.ma.ma10,
        20: colors.ma.ma20,
        30: colors.ma.ma30,
        60: colors.ma.ma60,
      }
      if (!instanceId) return
      const state = context.indicatorStateReader?.get<MARenderState>(instanceId)

      if (!state || state.visibleMin > state.visibleMax) {
        clearCache()
        return
      }

      if (state.enabledPeriods.length === 0) {
        clearCache()
        return
      }

      const cacheKey = buildMACacheKey(
        range,
        kLineCenters,
        pane,
        state.enabledPeriods,
        state.timestamp,
      )
      if (cachedKey !== cacheKey) {
        cachedKey = cacheKey
        cachedLines = new Map()

        for (const [periodStr, values] of Object.entries(state.series)) {
          const period = Number(periodStr)
          const points: LinePoint[] = []

          for (let i = range.start; i < range.end && i < values.length; i++) {
            const maValue = values[i]
            if (maValue === undefined) continue

            const centerX = kLineCenters[i - range.start]
            if (centerX === undefined) continue

            points.push({ x: centerX, y: pane.yAxis.priceToY(maValue) })
          }

          if (points.length >= 2) {
            cachedLines.set(period, points)
          }
        }
      }

      const lines: Array<{ points: LinePoint[]; width: number; color: string }> = []
      for (const period of state.enabledPeriods) {
        const points = cachedLines.get(period)
        if (!points) continue
        lines.push({ points, width: 1, color: maColors[period] ?? colors.ma.ma5 })
      }

      // sceneRenderer → fail-closed 2D
      if (tryDrawLinesGpu(context, lines, scrollLeft)) return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.lineWidth = 1
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'

      for (const period of state.enabledPeriods) {
        const points = cachedLines.get(period)
        if (!points || points.length < 2) continue
        ctx.strokeStyle = maColors[period] ?? colors.ma.ma5
        ctx.beginPath()
        ctx.moveTo(points[0]!.x, points[0]!.y)
        for (let i = 1; i < points.length; i++) {
          const point = points[i]!
          ctx.lineTo(point.x, point.y)
        }
        ctx.stroke()
      }

      ctx.restore()
    },
  })
}
