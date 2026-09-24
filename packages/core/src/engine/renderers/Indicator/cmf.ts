import type {
  IndicatorRenderStateReader,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '../../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../../foundation/tokens/index.js'
import { calcCMFData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { CMFRenderState } from '../../indicators/state/cmfState.js'
import { EMPTY_CMF_STATE } from '../../indicators/state/cmfState.js'
import { createFixedRangeSparseVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'

import { createSingleLineTitleInfo } from './shared/titleInfo.js'

type LinePoint = { x: number; y: number }

function createCMFRendererPlugin(options: {
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
} = {}): RendererPluginWithHost {
  const { paneId = 'sub_CMF', instanceId } = options
  let pluginHost: PluginHost | null = null

  return {
    name: `cmf_${paneId}`,
    version: '1.1.0',
    description: 'CMF Chaikin 资金流渲染器（WebGL + Canvas2D 回退）',
    debugName: 'CMF',
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
      const state = context.indicatorStateReader?.get<CMFRenderState>(instanceId)
      if (!state || !state.params.showCMF || state.visibleMin > state.visibleMax) return

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

      if (tryDrawLinesGpu(context, [{ points, width: 1, color: colors.palette.i6 }], scrollLeft))
        return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.palette.i6
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
        ?.get<CMFRenderState>(instanceId)
      return state?.params ?? {}
    },
    setConfig() {},
  }
}

const getCMFTitleInfo = createSingleLineTitleInfo({
  name: 'CMF',
  defaultPeriod: 20,
  getColor: (colors) => colors.palette.i6,
})

@Indicator({
  name: 'cmf',
  displayName: 'CMF',
  kind: IndicatorKind.Indicator,
  category: 'volume',
  indicatorType: 'volume',
  defaultPaneId: 'sub_CMF',
  visibleState: { compose: createFixedRangeSparseVisibleStateComposer('cmf', EMPTY_CMF_STATE) },
  scale: { indicatorKey: 'cmf', label: 'CMF', decimals: 4 },
  getTitleInfo: getCMFTitleInfo,
  presentation: { defaultOptions: { showCMF: true } },
  runtime: {
    defaultParams: { period: 20 },
    computeKey: 'calcCMFData',
    compute: (data, c) => calcCMFData(data, c.period),
  },
})
export class CMFIndicatorDefinition {
  static rendererFactory = createCMFRendererPlugin
}
