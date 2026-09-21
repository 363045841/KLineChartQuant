import type {
  IndicatorRenderStateReader,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '../../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index.js'
import type { ColorTokens } from '../../../foundation/tokens/index.js'
import { resolveThemeColors } from '../../../foundation/tokens/index.js'
import { calcPivotData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import type {
  GetTitleInfoFn,
  TitleInfo,
  TitleValueItem,
} from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { PivotRenderState } from '../../indicators/state/pivotState.js'
import { EMPTY_PIVOT_STATE } from '../../indicators/state/pivotState.js'
import { createExactRangePointVisibleStateComposer } from '../../indicators/visibleStateComposers.js'

type Point = { x: number; y: number }

function createPivotRendererPlugin(
  options: { paneId?: string; instanceId?: string } = {},
): RendererPluginWithHost {
  const { paneId = 'main', instanceId } = options
  let pluginHost: PluginHost | null = null

  return {
    name: `pivot_${paneId}`,
    version: '1.0.0',
    description: 'Pivot Points 枢轴点渲染器（PP/R1-3/S1-3 阶梯线）',
    debugName: 'Pivot',
    paneId,
    priority: RENDERER_PRIORITY.INDICATOR,
    onInstall(host) {
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
      const state = context.indicatorStateReader?.get<PivotRenderState>(instanceId)
      if (!state || state.visibleMin > state.visibleMax) return
      const p = state.params
      if (!(p.showPP || p.showR1 || p.showR2 || p.showR3 || p.showS1 || p.showS2 || p.showS3))
        return

      const { series } = state
      const toY = (v: number) => pane.yAxis.priceToY(v)

      const drawEnd = Math.min(range.end, series.length)
      const ppPts: Point[] = []
      const r1Pts: Point[] = []
      const r2Pts: Point[] = []
      const r3Pts: Point[] = []
      const s1Pts: Point[] = []
      const s2Pts: Point[] = []
      const s3Pts: Point[] = []
      for (let i = range.start; i < drawEnd; i++) {
        const pt = series[i]
        if (!pt) continue
        const centerX = kLineCenters[i - range.start]
        if (centerX === undefined) continue
        if (p.showPP) ppPts.push({ x: centerX, y: toY(pt.pp) })
        if (p.showR1) r1Pts.push({ x: centerX, y: toY(pt.r1) })
        if (p.showR2) r2Pts.push({ x: centerX, y: toY(pt.r2) })
        if (p.showR3) r3Pts.push({ x: centerX, y: toY(pt.r3) })
        if (p.showS1) s1Pts.push({ x: centerX, y: toY(pt.s1) })
        if (p.showS2) s2Pts.push({ x: centerX, y: toY(pt.s2) })
        if (p.showS3) s3Pts.push({ x: centerX, y: toY(pt.s3) })
      }

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.lineWidth = 1
      drawStep(ctx, ppPts, colors.palette.i10)
      drawStep(ctx, r1Pts, colors.pivot.resistance)
      drawStep(ctx, r2Pts, colors.pivot.resistance)
      drawStep(ctx, r3Pts, colors.pivot.resistance)
      drawStep(ctx, s1Pts, colors.palette.i3)
      drawStep(ctx, s2Pts, colors.palette.i3)
      drawStep(ctx, s3Pts, colors.palette.i3)
      ctx.restore()
    },
    getConfig() {
      if (!instanceId) return {}
      return (
        pluginHost
          ?.getService<IndicatorRenderStateReader>(INDICATOR_INSTANCE_STATE_SERVICE)
          ?.get<PivotRenderState>(instanceId)?.params ?? {}
      )
    },
    setConfig() {},
  }
}

function drawStep(ctx: CanvasRenderingContext2D, pts: Point[], color: string): void {
  if (pts.length < 2) return
  ctx.strokeStyle = color
  ctx.beginPath()
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let i = 1; i < pts.length; i++) {
    // Step line — held constant until next bar
    ctx.lineTo(pts[i]!.x, pts[i - 1]!.y)
    ctx.lineTo(pts[i]!.x, pts[i]!.y)
  }
  ctx.stroke()
}

const getPivotTitleInfo: GetTitleInfoFn = (
  _data,
  index,
  _params,
  stateReader,
  instanceId,
  _paneId,
  colors,
) => {
  if (index === null || index < 0) return null

  const state = stateReader.get<PivotRenderState>(instanceId)
  if (!state) return null

  const p = state.series[index]
  if (!p) return null

  const values: TitleValueItem[] = []

  if (state.params.showPP) {
    values.push({ label: 'PP', value: p.pp, color: colors.palette.i10 })
  }
  if (state.params.showR1) {
    values.push({ label: 'R1', value: p.r1, color: colors.pivot.resistance })
  }
  if (state.params.showR2) {
    values.push({ label: 'R2', value: p.r2, color: colors.pivot.resistance })
  }
  if (state.params.showR3) {
    values.push({ label: 'R3', value: p.r3, color: colors.pivot.resistance })
  }
  if (state.params.showS1) {
    values.push({ label: 'S1', value: p.s1, color: colors.palette.i3 })
  }
  if (state.params.showS2) {
    values.push({ label: 'S2', value: p.s2, color: colors.palette.i3 })
  }
  if (state.params.showS3) {
    values.push({ label: 'S3', value: p.s3, color: colors.palette.i3 })
  }

  if (values.length === 0) return null

  return {
    name: 'Pivot',
    params: [],
    values,
  }
}

@Indicator({
  name: 'pivot',
  displayName: 'Pivot',
  getTitleInfo: getPivotTitleInfo,
  category: 'main',
  indicatorType: 'support-resistance',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 'pivot_main',
    toActiveConfig: (params, active) => ({
      ...params,
      showPP: active,
      showR1: active,
      showR2: active,
      showR3: active,
      showS1: active,
      showS2: active,
      showS3: active,
    }),
  },
  scale: { indicatorKey: 'pivot', label: 'Pivot', decimals: 2 },
  visibleState: {
    compose: createExactRangePointVisibleStateComposer('pivot', EMPTY_PIVOT_STATE, [
      'pp',
      'r1',
      'r2',
      'r3',
      's1',
      's2',
      's3',
    ]),
  },
  presentation: {
    defaultOptions: {
      showPP: true,
      showR1: true,
      showR2: true,
      showR3: true,
      showS1: true,
      showS2: true,
      showS3: true,
    },
  },
  runtime: {
    defaultParams: {},
    computeKey: 'calcPivotData',
    compute: (data, c) => calcPivotData(data),
  },
})
export class PivotDefinition {
  static rendererFactory = createPivotRendererPlugin
}
