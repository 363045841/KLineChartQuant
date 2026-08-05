import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import { calcVWMAData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, WMASchedulerConfig } from '../../indicators/scheduler'
import type { VWMARenderState } from '../../indicators/state/vwmaState'
import { createVWMAStateKey, EMPTY_VWMA_STATE } from '../../indicators/state/vwmaState'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createSingleLineTitleInfo } from './shared/titleInfo'

type Point = { x: number; y: number }

interface VWMARendererOptions {
  paneId?: string
}

function getVWMAStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn('[VWMARenderer] Scheduler not available via service locator')
    return null
  }
  const meta = scheduler.getIndicatorMetadata('vwma')
  if (!meta) {
    console.warn("[VWMARenderer] Indicator metadata for 'vwma' not found, skip rendering")
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

function createVWMARendererPlugin(options: VWMARendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'main' } = options
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getVWMAStateKey(pluginHost, paneId)
  }

  return {
    name: `vwma_${paneId}`,
    version: '1.1.0',
    description: 'VWMA 成交量加权移动均线渲染器（WebGL + Canvas2D 回退）',
    debugName: 'VWMA',
    paneId,
    priority: RENDERER_PRIORITY.INDICATOR,

    onInstall(host: PluginHost) {
      pluginHost = host
    },

    getDeclaredNamespaces() {
      const key = resolveKey()
      return key ? [key] : []
    },

    draw(context: RenderContext) {
      const { ctx, pane, range, scrollLeft, kLineCenters } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )

      const stateKey = resolveKey()
      if (!stateKey) return
      const state = pluginHost?.getSharedState<VWMARenderState>(stateKey)
      if (!state || !state.params.showVWMA || state.visibleMin > state.visibleMax) return

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

      if (tryDrawLinesGpu(context, [{ points, width: 1, color: colors.palette.i8 }], scrollLeft))
        return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.palette.i8
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
      const stateKey = resolveKey()
      if (!stateKey) return {}
      const state = pluginHost?.getSharedState<VWMARenderState>(stateKey)
      return state?.params ?? {}
    },

    setConfig() {
      // no-op
    },
  }
}

const getVWMATitleInfo = createSingleLineTitleInfo({
  createStateKey: createVWMAStateKey,
  name: 'VWMA',
  getParams: (p) => [p.period as number],
  getColor: (colors) => colors.palette.i8,
})

@Indicator({
  name: 'vwma',
  displayName: 'VWMA',
  getTitleInfo: getVWMATitleInfo,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 'vwma_main',
    toActiveConfig: (params, active) => ({ ...params, showVWMA: active }),
  },
  visibleState: { compose: createSparseVisibleStateComposer('vwma', EMPTY_VWMA_STATE) },
  scale: { indicatorKey: 'vwma', label: 'VWMA', decimals: 2 },
  runtime: {
    defaultConfig: { period: 20, showVWMA: true },
    computeKey: 'calcVWMAData',
    compute: (data, c) => calcVWMAData(data, c.period),
  },
})
export class VWMADefinition {
  static rendererFactory = createVWMARendererPlugin
}
