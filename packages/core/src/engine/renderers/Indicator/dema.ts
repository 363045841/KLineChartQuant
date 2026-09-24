import type {
  IndicatorRenderStateReader,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { calcDEMAData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { DEMARenderState } from '../../indicators/state/demaState.js'
import { EMPTY_DEMA_STATE } from '../../indicators/state/demaState.js'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'

import { createSingleLineTitleInfo } from './shared/titleInfo.js'

type Point = { x: number; y: number }

interface DEMARendererOptions {
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

function createDEMARendererPlugin(options: DEMARendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'main', instanceId } = options
  let pluginHost: PluginHost | null = null

  return {
    name: `dema_${paneId}`,
    version: '1.1.0',
    description: 'DEMA 双重指数移动均线渲染器（WebGL + Canvas2D 回退）',
    debugName: 'DEMA',
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
      const state = context.indicatorStateReader?.get<DEMARenderState>(instanceId)
      if (!state || !state.params.showDEMA || state.visibleMin > state.visibleMax) return

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

      if (tryDrawLinesGpu(context, [{ points, width: 1, color: colors.palette.i9 }], scrollLeft))
        return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.palette.i9
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
        ?.get<DEMARenderState>(instanceId)
      return state?.params ?? {}
    },

    setConfig() {
      // no-op
    },
  }
}

const getDEMATitleInfo = createSingleLineTitleInfo({
  name: 'DEMA',
  getParams: (p) => [p.period as number],
  getColor: (colors) => colors.palette.i9,
})

@Indicator({
  name: 'dema',
  displayName: 'DEMA',
  kind: IndicatorKind.Indicator,
  getTitleInfo: getDEMATitleInfo,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 'dema_main',
    toActiveConfig: (params, active) => ({ ...params, showDEMA: active }),
  },
  visibleState: { compose: createSparseVisibleStateComposer('dema', EMPTY_DEMA_STATE) },
  scale: { indicatorKey: 'dema', label: 'DEMA', decimals: 2 },
  presentation: { defaultOptions: { showDEMA: true } },
  runtime: {
    defaultParams: { period: 14 },
    computeKey: 'calcDEMAData',
    compute: (data, c) => calcDEMAData(data, c.period),
  },
})
export class DEMADefinition {
  static rendererFactory = createDEMARendererPlugin
}
