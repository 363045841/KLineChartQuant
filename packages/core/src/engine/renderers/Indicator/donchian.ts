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
import { calcDonchianData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import {
  resolveStateKey,
  type TitleInfo,
  type GetTitleInfoFn,
} from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../../indicators/scheduler'
import type { DonchianRenderState } from '../../indicators/state/donchianState'
import { createDonchianStateKey, EMPTY_DONCHIAN_STATE } from '../../indicators/state/donchianState'
import { createBandVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { tryDrawLinesGpu } from '../linesViaRenderer'

type Point = { x: number; y: number }

interface DonchianRendererOptions {
  paneId?: string
}

function getDonchianStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn('[DonchianRenderer] Scheduler not available via service locator')
    return null
  }
  const meta = scheduler.getIndicatorMetadata('donchian')
  if (!meta) {
    console.warn("[DonchianRenderer] Indicator metadata for 'donchian' not found, skip rendering")
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

function createDonchianRendererPlugin(
  options: DonchianRendererOptions = {},
): RendererPluginWithHost {
  const { paneId = 'main' } = options
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getDonchianStateKey(pluginHost, paneId)
  }

  return {
    name: `donchian_${paneId}`,
    version: '1.1.0',
    description: 'Donchian Channel 渲染器（WebGL + Canvas2D 回退）',
    debugName: 'Donchian',
    paneId,
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
      const stateKey = resolveKey()
      if (!stateKey) return
      const state = context.indicatorStateReader?.get<DonchianRenderState>(stateKey)
      if (!state || state.visibleMin > state.visibleMax) return
      const { showUpper, showMiddle, showLower } = state.params
      if (!showUpper && !showMiddle && !showLower) return

      const { series } = state
      const toY = (v: number) => pane.yAxis.priceToY(v)
      const rangeStart = range.start

      const upperPts: Point[] = []
      const middlePts: Point[] = []
      const lowerPts: Point[] = []
      const drawEnd = Math.min(range.end, series.length)
      for (let i = range.start; i < drawEnd; i++) {
        const point = series[i]
        if (!point) continue
        const centerX = kLineCenters[i - rangeStart]
        if (centerX === undefined) continue
        if (showUpper) upperPts.push({ x: centerX, y: toY(point.upper) })
        if (showMiddle) middlePts.push({ x: centerX, y: toY(point.middle) })
        if (showLower) lowerPts.push({ x: centerX, y: toY(point.lower) })
      }

      const lines: Array<{ points: Point[]; width: number; color: string }> = []
      if (upperPts.length >= 2) lines.push({ points: upperPts, width: 1, color: colors.palette.i6 })
      if (middlePts.length >= 2)
        lines.push({ points: middlePts, width: 1, color: colors.palette.i10 })
      if (lowerPts.length >= 2) lines.push({ points: lowerPts, width: 1, color: colors.palette.i6 })

      if (tryDrawLinesGpu(context, lines, scrollLeft)) return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.lineWidth = 1
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      drawLine(ctx, upperPts, colors.palette.i6)
      drawLine(ctx, middlePts, colors.palette.i10)
      drawLine(ctx, lowerPts, colors.palette.i6)
      ctx.restore()
    },

    getConfig() {
      const stateKey = resolveKey()
      if (!stateKey) return {}
      const state = pluginHost
        ?.getService<IndicatorScheduler>('indicatorScheduler')
        ?.createRenderStateReader()
        .get<DonchianRenderState>(stateKey)
      return state?.params ?? {}
    },
    setConfig() {},
  }
}

function drawLine(ctx: CanvasRenderingContext2D, pts: Point[], color: string): void {
  if (pts.length < 2) return
  ctx.strokeStyle = color
  ctx.beginPath()
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y)
  ctx.stroke()
}

function getDonchianTitleInfo(
  _data: KLineData[],
  index: number | null,
  params: Record<string, number | boolean | string>,
  stateReader: IndicatorRenderStateReader,
  paneId: string,
  colors: ColorTokens,
): TitleInfo | null {
  if (index === null) return null
  const state = stateReader.get<DonchianRenderState>(createDonchianStateKey(paneId))
  const p = state?.series[index]
  if (!p) return null

  return {
    name: 'Donchian',
    params: [(params.period as number) ?? 20],
    values: [
      { label: 'Upper', value: p.upper, color: colors.palette.i6 },
      { label: 'Mid', value: p.middle, color: colors.palette.i10 },
      { label: 'Lower', value: p.lower, color: colors.palette.i6 },
    ],
  }
}

@Indicator({
  name: 'donchian',
  displayName: 'Donchian',
  getTitleInfo: getDonchianTitleInfo,
  category: 'main',
  indicatorType: 'channel',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 'donchian_main',
    toActiveConfig: (params, active) => ({
      ...params,
      showUpper: active,
      showMiddle: active,
      showLower: active,
    }),
  },
  scale: { indicatorKey: 'donchian', label: 'Donchian', decimals: 2 },
  visibleState: {
    compose: createBandVisibleStateComposer('donchian', EMPTY_DONCHIAN_STATE, 'lower', 'upper'),
  },
  presentation: { defaultOptions: { showUpper: true, showMiddle: true, showLower: true } },
  runtime: {
    defaultParams: { period: 20 },
    computeKey: 'calcDonchianData',
    compute: (data, c) => calcDonchianData(data, c.period),
  },
})
export class DonchianDefinition {
  static rendererFactory = createDonchianRendererPlugin
}
