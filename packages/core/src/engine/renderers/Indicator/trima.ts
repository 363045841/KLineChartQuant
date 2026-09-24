// TRIMA 三角移动均线渲染器插件与指标定义（WebGL + Canvas2D 回退）
import type {
  IndicatorRenderStateReader,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { calcTRIMAData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { TRIMARenderState } from '../../indicators/state/trimaState.js'
import { EMPTY_TRIMA_STATE } from '../../indicators/state/trimaState.js'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'

import { createSingleLineTitleInfo } from './shared/titleInfo.js'

type Point = { x: number; y: number }

interface TRIMARendererOptions {
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

function createTRIMARendererPlugin(options: TRIMARendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'main', instanceId } = options
  let pluginHost: PluginHost | null = null

  return {
    name: `trima_${paneId}`,
    version: '1.1.0',
    description: 'TRIMA 三角移动均线渲染器（WebGL + Canvas2D 回退）',
    debugName: 'TRIMA',
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
      const state = context.indicatorStateReader?.get<TRIMARenderState>(instanceId)
      if (!state || !state.params.showTRIMA || state.visibleMin > state.visibleMax) return

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
        ?.get<TRIMARenderState>(instanceId)
      return state?.params ?? {}
    },

    setConfig() {
      // no-op
    },
  }
}

const getTRIMATitleInfo = createSingleLineTitleInfo({
  name: 'TRIMA',
  getParams: (p) => [p.period as number],
  getColor: (colors) => colors.palette.i5,
})

@Indicator({
  name: 'trima',
  displayName: 'TRIMA',
  kind: IndicatorKind.Indicator,
  getTitleInfo: getTRIMATitleInfo,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 'trima_main',
    toActiveConfig: (params, active) => ({ ...params, showTRIMA: active }),
  },
  visibleState: { compose: createSparseVisibleStateComposer('trima', EMPTY_TRIMA_STATE) },
  scale: { indicatorKey: 'trima', label: 'TRIMA', decimals: 2 },
  presentation: { defaultOptions: { showTRIMA: true } },
  runtime: {
    defaultParams: { period: 20 },
    computeKey: 'calcTRIMAData',
    compute: (data, c) => calcTRIMAData(data, c.period),
  },
})
export class TRIMADefinition {
  static rendererFactory = createTRIMARendererPlugin
}
