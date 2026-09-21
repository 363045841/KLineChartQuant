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
import { calcTRIXData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import type { TitleInfo } from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { TRIXRenderState } from '../../indicators/state/trixState.js'
import { EMPTY_TRIX_STATE } from '../../indicators/state/trixState.js'
import { createDualSparseVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'

type Point = { x: number; y: number }

interface TRIXRendererOptions {
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

function createTRIXRendererPlugin(options: TRIXRendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'sub_TRIX', instanceId } = options
  let pluginHost: PluginHost | null = null

  return {
    name: `trix_${paneId}`,
    version: '1.1.0',
    description: 'TRIX 三重指数平滑振荡器渲染器（WebGL + Canvas2D 回退）',
    debugName: 'TRIX',
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
      const trixColor = colors.palette.i4
      const signalColor = colors.palette.i2
      if (!instanceId) return
      const state = context.indicatorStateReader?.get<TRIXRenderState>(instanceId)
      if (!state || state.visibleMin > state.visibleMax) return
      const { showTRIX, showSignal } = state.params
      if (!showTRIX && !showSignal) return

      const { valueMin, valueMax, series, signalSeries } = state
      const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
      const displayMin = displayRange.minPrice
      const displayMax = displayRange.maxPrice
      const displayValueRange = displayMax - displayMin || 1
      const paneH = pane.height
      const invRange = paneH / displayValueRange
      const rangeStart = range.start
      const toY = (v: number) => paneH - (v - displayMin) * invRange

      // Zero line
      const zeroY = toY(0)
      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.referenceLine.neutral
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(scrollLeft, zeroY)
      ctx.lineTo(scrollLeft + context.paneWidth, zeroY)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()

      const trixPts: Point[] = []
      const sigPts: Point[] = []
      const drawEnd = Math.min(range.end, series.length)
      for (let i = range.start; i < drawEnd; i++) {
        const centerX = kLineCenters[i - rangeStart]
        if (centerX === undefined) continue
        if (showTRIX) {
          const v = series[i]
          if (v !== undefined) trixPts.push({ x: centerX, y: toY(v) })
        }
        if (showSignal) {
          const s = signalSeries[i]
          if (s !== undefined) sigPts.push({ x: centerX, y: toY(s) })
        }
      }

      if (trixPts.length < 2 && sigPts.length < 2) return

      const lines: Array<{ points: Point[]; width: number; color: string }> = []
      if (trixPts.length >= 2) lines.push({ points: trixPts, width: 1, color: trixColor })
      if (sigPts.length >= 2) lines.push({ points: sigPts, width: 1, color: signalColor })

      if (tryDrawLinesGpu(context, lines, scrollLeft)) return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.lineWidth = 1
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      drawLine(ctx, trixPts, trixColor)
      drawLine(ctx, sigPts, signalColor)
      ctx.restore()
    },

    getConfig() {
      if (!instanceId) return {}
      const state = pluginHost
        ?.getService<IndicatorRenderStateReader>(INDICATOR_INSTANCE_STATE_SERVICE)
        ?.get<TRIXRenderState>(instanceId)
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

function getTRIXTitleInfo(
  _data: KLineData[],
  index: number | null,
  params: Record<string, number | boolean | string>,
  stateReader: IndicatorRenderStateReader,
  instanceId: string,
  _paneId: string,
  colors: ColorTokens,
): TitleInfo | null {
  if (index === null) return null
  const period = (params.period as number) ?? 15
  const signalPeriod = (params.signalPeriod as number) ?? 9
  const state = stateReader.get<TRIXRenderState>(instanceId)
  if (!state) return null

  const values: Array<{ label: string; value: number; color: string }> = []

  if (state.params.showTRIX) {
    const v = state.series[index]
    if (v !== undefined) values.push({ label: 'TRIX', value: v, color: colors.palette.i4 })
  }
  if (state.params.showSignal) {
    const v = state.signalSeries[index]
    if (v !== undefined) values.push({ label: 'Signal', value: v, color: colors.palette.i2 })
  }

  if (values.length === 0) return null

  return {
    name: 'TRIX',
    params: [period, signalPeriod],
    values,
  }
}

@Indicator({
  name: 'trix',
  displayName: 'TRIX',
  category: 'oscillator',
  indicatorType: 'momentum',
  defaultPaneId: 'sub_TRIX',
  scale: { indicatorKey: 'trix', label: 'TRIX', decimals: 6 },
  visibleState: { compose: createDualSparseVisibleStateComposer('trix', EMPTY_TRIX_STATE) },
  getTitleInfo: getTRIXTitleInfo,
  presentation: { defaultOptions: { showTRIX: true, showSignal: true } },
  runtime: {
    defaultParams: { period: 15, signalPeriod: 9 },
    computeKey: 'calcTRIXData',
    compute: (data, c) => calcTRIXData(data, c.period, c.signalPeriod),
  },
})
export class TRIXIndicatorDefinition {
  static rendererFactory = createTRIXRendererPlugin
}
