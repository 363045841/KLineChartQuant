import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import { calcWMAData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, WMASchedulerConfig } from '../../indicators/scheduler'
import type { WMARenderState } from '../../indicators/state/wmaState'
import { createWMAStateKey, EMPTY_WMA_STATE } from '../../indicators/state/wmaState'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createSingleLineTitleInfo } from './shared/titleInfo'

type Point = { x: number; y: number }

interface WMARendererOptions {
  paneId?: string
}

function getWMAStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn('[WMARenderer] Scheduler not available via service locator')
    return null
  }
  const meta = scheduler.getIndicatorMetadata('wma')
  if (!meta) {
    console.warn("[WMARenderer] Indicator metadata for 'wma' not found, skip rendering")
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

function createWMARendererPlugin(options: WMARendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'main' } = options
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getWMAStateKey(pluginHost, paneId)
  }

  return {
    name: `wma_${paneId}`,
    version: '1.1.0',
    description: 'WMA 线性加权移动均线渲染器（WebGL + Canvas2D 回退）',
    debugName: 'WMA',
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
      const state = pluginHost?.getSharedState<WMARenderState>(stateKey)
      if (!state || !state.params.showWMA || state.visibleMin > state.visibleMax) return

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

      if (tryDrawLinesGpu(context, [{ points, width: 1, color: colors.palette.i3 }], scrollLeft))
        return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.palette.i3
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
      const state = pluginHost?.getSharedState<WMARenderState>(stateKey)
      return state?.params ?? {}
    },

    setConfig() {
      // no-op
    },
  }
}

const getWMATitleInfo = createSingleLineTitleInfo({
  createStateKey: createWMAStateKey,
  name: 'WMA',
  getParams: (p) => [p.period as number],
  getColor: (colors) => colors.palette.i3,
})

@Indicator({
  name: 'wma',
  displayName: 'WMA',
  getTitleInfo: getWMATitleInfo,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 'wma_main',
    toActiveConfig: (params, active) => ({ ...params, showWMA: active }),
  },
  visibleState: { compose: createSparseVisibleStateComposer('wma', EMPTY_WMA_STATE) },
  scale: { indicatorKey: 'wma', label: 'WMA', decimals: 2 },
  runtime: {
    defaultConfig: { period: 10, showWMA: true },
    computeKey: 'calcWMAData',
    compute: (data, c) => calcWMAData(data, c.period),
  },
})
class WMADefinition {
  static rendererFactory = createWMARendererPlugin
}
