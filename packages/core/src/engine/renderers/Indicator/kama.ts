import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import { calcKAMAData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, KAMASchedulerConfig } from '../../indicators/scheduler'
import type { KAMARenderState } from '../../indicators/state/kamaState'
import { createKAMAStateKey, EMPTY_KAMA_STATE } from '../../indicators/state/kamaState'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createSingleLineTitleInfo } from './shared/titleInfo'

type Point = { x: number; y: number }

interface KAMARendererOptions {
  paneId?: string
}

function getKAMAStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn('[KAMARenderer] Scheduler not available via service locator')
    return null
  }
  const meta = scheduler.getIndicatorMetadata('kama')
  if (!meta) {
    console.warn("[KAMARenderer] Indicator metadata for 'kama' not found, skip rendering")
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

function createKAMARendererPlugin(options: KAMARendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'main' } = options
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getKAMAStateKey(pluginHost, paneId)
  }

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
      const state = pluginHost?.getSharedState<KAMARenderState>(stateKey)
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
      const stateKey = resolveKey()
      if (!stateKey) return {}
      const state = pluginHost?.getSharedState<KAMARenderState>(stateKey)
      return state?.params ?? {}
    },

    setConfig() {
      // no-op
    },
  }
}

const getKAMATitleInfo = createSingleLineTitleInfo({
  createStateKey: createKAMAStateKey,
  name: 'KAMA',
  getParams: (p) => [p.period as number, p.fastPeriod as number, p.slowPeriod as number],
  getColor: (colors) => colors.palette.i6,
})

@Indicator({
  name: 'kama',
  displayName: 'KAMA',
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
  runtime: {
    defaultConfig: { period: 10, fastPeriod: 2, slowPeriod: 30, showKAMA: true },
    computeKey: 'calcKAMAData',
    compute: (data, c) => calcKAMAData(data, c.period, c.fastPeriod, c.slowPeriod),
  },
})
export class KAMADefinition {
  static rendererFactory = createKAMARendererPlugin
}
