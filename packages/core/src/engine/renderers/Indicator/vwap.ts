import type {
  IndicatorRenderStateReader,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '../../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../../foundation/tokens/index.js'
import { calcVWAPData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { VWAPRenderState } from '../../indicators/state/vwapState.js'
import { EMPTY_VWAP_STATE } from '../../indicators/state/vwapState.js'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'

import { createSingleLineTitleInfo } from './shared/titleInfo.js'

type LinePoint = { x: number; y: number }

function createVWAPRendererPlugin(
  options: { paneId?: string; instanceId?: string } = {},
): RendererPluginWithHost {
  const { paneId = 'sub_VWAP', instanceId } = options
  let pluginHost: PluginHost | null = null

  return {
    name: `vwap_${paneId}`,
    version: '1.1.0',
    description: 'VWAP 成交量加权均价渲染器（WebGL + Canvas2D 回退）',
    debugName: 'VWAP',
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
      const state = context.indicatorStateReader?.get<VWAPRenderState>(instanceId)
      if (!state || !state.params.showVWAP || state.visibleMin > state.visibleMax) return

      const { valueMin, valueMax, series } = state
      const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
      const displayMin = displayRange.minPrice
      const displayMax = displayRange.maxPrice
      const displayValueRange = displayMax - displayMin || 1
      const paneH = pane.height
      const invRange = paneH / displayValueRange
      const rangeStart = range.start

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

      if (tryDrawLinesGpu(context, [{ points, width: 1, color: colors.palette.i4 }], scrollLeft))
        return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.palette.i4
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
        ?.get<VWAPRenderState>(instanceId)
      return state?.params ?? {}
    },
    setConfig() {},
  }
}

const getVWAPTitleInfo = createSingleLineTitleInfo({
  name: 'VWAP',
  getColor: (colors) => colors.palette.i4,
})

@Indicator({
  name: 'vwap',
  displayName: 'VWAP',
  kind: IndicatorKind.Indicator,
  category: 'volume',
  indicatorType: 'volume',
  defaultPaneId: 'sub_VWAP',
  visibleState: { compose: createSparseVisibleStateComposer('vwap', EMPTY_VWAP_STATE) },
  scale: { indicatorKey: 'vwap', label: 'VWAP', decimals: 2 },
  getTitleInfo: getVWAPTitleInfo,
  presentation: { defaultOptions: { showVWAP: true } },
  runtime: {
    defaultParams: { sessionResetGapMs: 0 },
    computeKey: 'calcVWAPData',
    compute: (data, c) => calcVWAPData(data, c.sessionResetGapMs),
  },
})
export class VWAPIndicatorDefinition {
  static rendererFactory = createVWAPRendererPlugin
}
