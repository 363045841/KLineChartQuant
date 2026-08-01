import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import { calcVWAPData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, VWAPSchedulerConfig } from '../../indicators/scheduler'
import type { VWAPRenderState } from '../../indicators/state/vwapState'
import { createVWAPStateKey, EMPTY_VWAP_STATE } from '../../indicators/state/vwapState'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createSingleLineTitleInfo } from './shared/titleInfo'

type LinePoint = { x: number; y: number }

function getVWAPStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn(`[VWAPRenderer] Scheduler not available via service locator`)
    return null
  }
  const meta = scheduler.getIndicatorMetadata('vwap')
  if (!meta) {
    console.warn(`[VWAPRenderer] Indicator metadata for 'vwap' not found, skip rendering`)
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

function createVWAPRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
  const { paneId = 'sub_VWAP' } = options
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getVWAPStateKey(pluginHost, paneId)
  }
  return {
    name: `vwap_${paneId}`,
    version: '1.1.0',
    description: 'VWAP 成交量加权均价渲染器（WebGL + Canvas2D 回退）',
    debugName: 'VWAP',
    paneId,
    priority: RENDERER_PRIORITY.MAIN,
    onInstall(host) {
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
      const state = pluginHost?.getSharedState<VWAPRenderState>(stateKey)
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
      const stateKey = resolveKey()
      if (!stateKey) return {}
      const state = pluginHost?.getSharedState<VWAPRenderState>(stateKey)
      return state?.params ?? {}
    },
    setConfig() {},
  }
}

const getVWAPTitleInfo = createSingleLineTitleInfo({
  createStateKey: createVWAPStateKey,
  name: 'VWAP',
  getColor: (colors) => colors.palette.i4,
})

@Indicator({
  name: 'vwap',
  displayName: 'VWAP',
  category: 'volume',
  indicatorType: 'volume',
  defaultPaneId: 'sub_VWAP',
  visibleState: { compose: createSparseVisibleStateComposer('vwap', EMPTY_VWAP_STATE) },
  scale: { indicatorKey: 'vwap', label: 'VWAP', decimals: 2 },
  getTitleInfo: getVWAPTitleInfo,
  runtime: {
    defaultConfig: { sessionResetGapMs: 0, showVWAP: true },
    computeKey: 'calcVWAPData',
    compute: (data, c) => calcVWAPData(data, c.sessionResetGapMs),
  },
})
class VWAPIndicatorDefinition {
  static rendererFactory = createVWAPRendererPlugin
}
