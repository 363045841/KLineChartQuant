import type {
  IndicatorRenderStateReader,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '../../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../../foundation/tokens/index.js'
import { calcChaikinVolData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { ChaikinVolRenderState } from '../../indicators/state/chaikinVolState.js'
import { EMPTY_CHAIKIN_VOL_STATE } from '../../indicators/state/chaikinVolState.js'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'

import { createSingleLineTitleInfo } from './shared/titleInfo.js'

type LinePoint = { x: number; y: number }

function createChaikinVolRendererPlugin(options: {
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
} = {}): RendererPluginWithHost {
  const { paneId = 'sub_ChaikinVol', instanceId } = options
  let pluginHost: PluginHost | null = null

  return {
    name: `chaikinVol_${paneId}`,
    version: '1.1.0',
    description: 'Chaikin Volatility 渲染器（WebGL + Canvas2D 回退）',
    debugName: 'ChaikinVol',
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
      const state = context.indicatorStateReader?.get<ChaikinVolRenderState>(instanceId)
      if (!state || !state.params.showChaikinVol || state.visibleMin > state.visibleMax) return

      const { valueMin, valueMax, series } = state
      const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
      const displayMin = displayRange.minPrice
      const displayMax = displayRange.maxPrice
      const displayValueRange = displayMax - displayMin || 1
      const paneH = pane.height
      const invRange = paneH / displayValueRange
      const rangeStart = range.start

      // Zero line
      const zeroY = paneH - (0 - displayMin) * invRange
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

      const drawEnd = Math.min(range.end, series.length)
      const points: LinePoint[] = []
      for (let i = range.start; i < drawEnd; i++) {
        const value = series[i]
        if (value === undefined) continue
        const centerX = kLineCenters[i - rangeStart]
        if (centerX === undefined) continue
        points.push({ x: centerX, y: paneH - (value - displayMin) * invRange })
      }

      if (points.length < 2) return

      if (tryDrawLinesGpu(context, [{ points, width: 1, color: colors.palette.i2 }], scrollLeft))
        return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.palette.i2
      ctx.lineWidth = 1
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(points[0]!.x, points[0]!.y)
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i]!.x, points[i]!.y)
      }
      ctx.stroke()
      ctx.restore()
    },
    getConfig() {
      if (!instanceId) return {}
      const state = pluginHost
        ?.getService<IndicatorRenderStateReader>(INDICATOR_INSTANCE_STATE_SERVICE)
        ?.get<ChaikinVolRenderState>(instanceId)
      return state?.params ?? {}
    },
    setConfig() {},
  }
}

const getChaikinVolTitleInfo = createSingleLineTitleInfo({
  name: 'ChaikinVol',
  getParams: (p) => [(p.emaPeriod as number) ?? 10, (p.rocPeriod as number) ?? 10],
  getColor: (colors) => colors.palette.i2,
})

@Indicator({
  name: 'chaikinVol',
  displayName: 'ChaikinVol',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  indicatorType: 'volatility',
  defaultPaneId: 'sub_ChaikinVol',
  visibleState: {
    compose: createSparseVisibleStateComposer('chaikinVol', EMPTY_CHAIKIN_VOL_STATE),
  },
  scale: { indicatorKey: 'chaikinVol', label: 'ChaikinVol', decimals: 2 },
  getTitleInfo: getChaikinVolTitleInfo,
  presentation: { defaultOptions: { showChaikinVol: true } },
  runtime: {
    defaultParams: { emaPeriod: 10, rocPeriod: 10 },
    computeKey: 'calcChaikinVolData',
    compute: (data, c) => calcChaikinVolData(data, c.emaPeriod, c.rocPeriod),
  },
})
export class ChaikinVolIndicatorDefinition {
  static rendererFactory = createChaikinVolRendererPlugin
}
