import type {
  IndicatorRenderStateReader,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { calcKAMAData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { KAMARenderState } from '../../indicators/state/kamaState.js'
import { EMPTY_KAMA_STATE } from '../../indicators/state/kamaState.js'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'

import { createSingleLineTitleInfo } from './shared/titleInfo.js'

type Point = { x: number; y: number }

interface KAMARendererOptions {
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

function createKAMARendererPlugin(options: KAMARendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'main', instanceId } = options
  let pluginHost: PluginHost | null = null

  return {
    name: `kama_${paneId}`,
    version: '1.1.0',
    description: 'KAMA Kaufman 自适应均线渲染器（WebGL + Canvas2D 回退）',
    debugName: 'KAMA',
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
      const state = context.indicatorStateReader?.get<KAMARenderState>(instanceId)
      if (!state || !state.params.showKAMA || state.visibleMin > state.visibleMax) return

      const { series } = state
      const drawEnd = Math.min(range.end, series.length)
      const rangeStart = range.start

      const points: Point[] = []
      for (let i = range.start; i < drawEnd; i++) {
        const value = series[i]
        if (value === undefined) continue
        const centerX = kLineCenters[i - rangeStart]
        if (centerX === undefined) continue
        points.push({ x: centerX, y: pane.yAxis.priceToY(value) })
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
        ?.get<KAMARenderState>(instanceId)
      return state?.params ?? {}
    },

    setConfig() {
      // no-op
    },
  }
}

const getKAMATitleInfo = createSingleLineTitleInfo({
  name: 'KAMA',
  getParams: (p) => [p.period as number, p.fastPeriod as number, p.slowPeriod as number],
  getColor: (colors) => colors.palette.i6,
})

@Indicator({
  name: 'kama',
  displayName: 'KAMA',
  kind: IndicatorKind.Indicator,
  getTitleInfo: getKAMATitleInfo,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 'kama_main',
    toActiveConfig: (params, active) => ({ ...params, showKAMA: active }),
  },
  visibleState: { compose: createSparseVisibleStateComposer('kama', EMPTY_KAMA_STATE) },
  scale: { indicatorKey: 'kama', label: 'KAMA', decimals: 2 },
  presentation: { defaultOptions: { showKAMA: true } },
  runtime: {
    defaultParams: { period: 10, fastPeriod: 2, slowPeriod: 30 },
    computeKey: 'calcKAMAData',
    compute: (data, c) => calcKAMAData(data, c.period, c.fastPeriod, c.slowPeriod),
  },
})
export class KAMADefinition {
  static rendererFactory = createKAMARendererPlugin
}
