import type {
  IndicatorRenderStateReader,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '../../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index.js'
import type { ColorTokens } from '../../../foundation/tokens/index.js'
import { resolveThemeColors } from '../../../foundation/tokens/index.js'
import type { KLineData } from '../../../foundation/types/price.js'
import { calcKeltnerData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import type { TitleInfo } from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { KeltnerRenderState } from '../../indicators/state/keltnerState.js'
import { EMPTY_KELTNER_STATE } from '../../indicators/state/keltnerState.js'
import { createBandVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'

type Point = { x: number; y: number }

interface KeltnerRendererOptions {
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

function createKeltnerRendererPlugin(options: KeltnerRendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'main', instanceId } = options
  let pluginHost: PluginHost | null = null

  return {
    name: `keltner_${paneId}`,
    version: '1.1.0',
    description: 'Keltner Channel 渲染器（WebGL + Canvas2D 回退）',
    debugName: 'Keltner',
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
      const state = context.indicatorStateReader?.get<KeltnerRenderState>(instanceId)
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
      if (upperPts.length >= 2) lines.push({ points: upperPts, width: 1, color: colors.palette.i8 })
      if (middlePts.length >= 2)
        lines.push({ points: middlePts, width: 1, color: colors.palette.i2 })
      if (lowerPts.length >= 2) lines.push({ points: lowerPts, width: 1, color: colors.palette.i8 })

      if (tryDrawLinesGpu(context, lines, scrollLeft)) return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.lineWidth = 1
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      drawLine(ctx, upperPts, colors.palette.i8)
      drawLine(ctx, middlePts, colors.palette.i2)
      drawLine(ctx, lowerPts, colors.palette.i8)
      ctx.restore()
    },

    getConfig() {
      if (!instanceId) return {}
      const state = pluginHost
        ?.getService<IndicatorRenderStateReader>(INDICATOR_INSTANCE_STATE_SERVICE)
        ?.get<KeltnerRenderState>(instanceId)
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

function getKeltnerTitleInfo(
  _data: KLineData[],
  index: number | null,
  params: Record<string, number | boolean | string>,
  stateReader: IndicatorRenderStateReader,
  instanceId: string,
  _paneId: string,
  colors: ColorTokens,
): TitleInfo | null {
  if (index === null) return null
  const state = stateReader.get<KeltnerRenderState>(instanceId)
  const p = state?.series[index]
  if (!p) return null

  return {
    name: 'Keltner',
    params: [
      (params.emaPeriod as number) ?? 20,
      (params.atrPeriod as number) ?? 10,
      (params.multiplier as number) ?? 2,
    ],
    values: [
      { label: 'Upper', value: p.upper, color: colors.palette.i8 },
      { label: 'Mid', value: p.middle, color: colors.palette.i2 },
      { label: 'Lower', value: p.lower, color: colors.palette.i8 },
    ],
  }
}

@Indicator({
  name: 'keltner',
  displayName: 'Keltner',
  getTitleInfo: getKeltnerTitleInfo,
  category: 'main',
  indicatorType: 'channel',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 'keltner_main',
    toActiveConfig: (params, active) => ({
      ...params,
      showUpper: active,
      showMiddle: active,
      showLower: active,
    }),
  },
  scale: { indicatorKey: 'keltner', label: 'Keltner', decimals: 2 },
  visibleState: {
    compose: createBandVisibleStateComposer('keltner', EMPTY_KELTNER_STATE, 'lower', 'upper'),
  },
  presentation: { defaultOptions: { showUpper: true, showMiddle: true, showLower: true } },
  runtime: {
    defaultParams: { emaPeriod: 20, atrPeriod: 10, multiplier: 2 },
    computeKey: 'calcKeltnerData',
    compute: (data, c) => calcKeltnerData(data, c.emaPeriod, c.atrPeriod, c.multiplier),
  },
})
export class KeltnerDefinition {
  static rendererFactory = createKeltnerRendererPlugin
}
