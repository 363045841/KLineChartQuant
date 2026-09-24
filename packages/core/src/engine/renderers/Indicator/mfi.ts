import type {
  IndicatorRenderStateReader,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { calcMFIData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { MFIRenderState } from '../../indicators/state/mfiState.js'
import { EMPTY_MFI_STATE } from '../../indicators/state/mfiState.js'
import { createFixedRangeSparseVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'

import { createSingleLineTitleInfo } from './shared/titleInfo.js'

type LinePoint = { x: number; y: number }

function createMFIRendererPlugin(
  options: { paneId?: string; instanceId?: string } = {},
): RendererPluginWithHost {
  const { paneId = 'sub_MFI', instanceId } = options
  let pluginHost: PluginHost | null = null

  return {
    name: `mfi_${paneId}`,
    version: '1.1.0',
    description: 'MFI 资金流强弱渲染器（WebGL + Canvas2D 回退，80/20 超买超卖线）',
    debugName: 'MFI',
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
      const state = context.indicatorStateReader?.get<MFIRenderState>(instanceId)
      if (!state || !state.params.showMFI || state.visibleMin > state.visibleMax) return

      const { valueMin, valueMax, series } = state
      const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
      const displayMin = displayRange.minPrice
      const displayMax = displayRange.maxPrice
      const displayValueRange = displayMax - displayMin || 1
      const paneH = pane.height
      const invRange = paneH / displayValueRange
      const rangeStart = range.start
      const toY = (v: number) => paneH - (v - displayMin) * invRange

      // 80 / 20 reference lines（复用 CCI 超买超卖 token：语义同为买卖压力带）
      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.cci.overbought
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(scrollLeft, toY(80))
      ctx.lineTo(scrollLeft + context.paneWidth, toY(80))
      ctx.stroke()
      ctx.strokeStyle = colors.cci.oversold
      ctx.beginPath()
      ctx.moveTo(scrollLeft, toY(20))
      ctx.lineTo(scrollLeft + context.paneWidth, toY(20))
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
        points.push({ x: centerX, y: toY(value) })
      }

      if (points.length < 2) return

      if (tryDrawLinesGpu(context, [{ points, width: 1, color: colors.palette.i5 }], scrollLeft))
        return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.palette.i5
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
        ?.get<MFIRenderState>(instanceId)
      return state?.params ?? {}
    },
    setConfig() {},
  }
}

const getMFITitleInfo = createSingleLineTitleInfo({
  name: 'MFI',
  defaultPeriod: 14,
  getColor: (colors) => colors.palette.i5,
})

@Indicator({
  name: 'mfi',
  displayName: 'MFI',
  kind: IndicatorKind.Indicator,
  category: 'volume',
  indicatorType: 'volume',
  defaultPaneId: 'sub_MFI',
  visibleState: { compose: createFixedRangeSparseVisibleStateComposer('mfi', EMPTY_MFI_STATE) },
  scale: { indicatorKey: 'mfi', label: 'MFI', decimals: 2 },
  getTitleInfo: getMFITitleInfo,
  presentation: { defaultOptions: { showMFI: true } },
  runtime: {
    defaultParams: { period: 14 },
    computeKey: 'calcMFIData',
    compute: (data, c) => calcMFIData(data, c.period),
  },
})
export class MFIIndicatorDefinition {
  static rendererFactory = createMFIRendererPlugin
}
