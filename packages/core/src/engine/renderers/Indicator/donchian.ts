import type {
  IndicatorRenderStateReader,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import type { ColorTokens } from '@/foundation/tokens/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import type { KLineData } from '@/foundation/types/price.js'
import { calcDonchianData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import {
  type GetTitleInfoFn,
  IndicatorKind,
  type TitleInfo,
} from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { DonchianRenderState } from '../../indicators/state/donchianState.js'
import { EMPTY_DONCHIAN_STATE } from '../../indicators/state/donchianState.js'
import { createBandVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'

type Point = { x: number; y: number }

interface DonchianRendererOptions {
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

function createDonchianRendererPlugin(
  options: DonchianRendererOptions = {},
): RendererPluginWithHost {
  const { paneId = 'main', instanceId } = options
  let pluginHost: PluginHost | null = null

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
      return instanceId ? [instanceId] : []
    },

    draw(context: RenderContext) {
      const { ctx, pane, range, scrollLeft, kLineCenters } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      if (!instanceId) return
      const state = context.indicatorStateReader?.get<DonchianRenderState>(instanceId)
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
      if (!instanceId) return {}
      const state = pluginHost
        ?.getService<IndicatorRenderStateReader>(INDICATOR_INSTANCE_STATE_SERVICE)
        ?.get<DonchianRenderState>(instanceId)
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
  instanceId: string,
  _paneId: string,
  colors: ColorTokens,
): TitleInfo | null {
  if (index === null) return null
  const state = stateReader.get<DonchianRenderState>(instanceId)
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
  kind: IndicatorKind.Indicator,
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
