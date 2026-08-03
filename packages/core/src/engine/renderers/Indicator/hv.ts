import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import { calcHVData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, HVSchedulerConfig } from '../../indicators/scheduler'
import type { HVRenderState } from '../../indicators/state/hvState'
import { createHVStateKey } from '../../indicators/state/hvState'
import { EMPTY_HV_STATE } from '../../indicators/state/hvState'
import { createNonNegativeSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createSingleLineTitleInfo } from './shared/titleInfo'

type LinePoint = { x: number; y: number }

function getHVStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn(`[HVRenderer] Scheduler not available via service locator`)
    return null
  }
  const meta = scheduler.getIndicatorMetadata('hv')
  if (!meta) {
    console.warn(`[HVRenderer] Indicator metadata for 'hv' not found, skip rendering`)
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

function createHVRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
  const { paneId = 'sub_HV' } = options
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getHVStateKey(pluginHost, paneId)
  }

  return {
    name: `hv_${paneId}`,
    version: '1.1.0',
    description: 'HV 历史波动率渲染器（WebGL + Canvas2D 回退）',
    debugName: 'HV',
    paneId,
    priority: RENDERER_PRIORITY.INDICATOR,
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
      const state = pluginHost?.getSharedState<HVRenderState>(stateKey)
      if (!state || !state.params.showHV || state.visibleMin > state.visibleMax) return

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
      const state = pluginHost?.getSharedState<HVRenderState>(stateKey)
      return state?.params ?? {}
    },
    setConfig() {},
  }
}

const getHVTitleInfo = createSingleLineTitleInfo({
  createStateKey: createHVStateKey,
  name: 'HV',
  getParams: (p) => [(p.period as number) ?? 20, (p.annualizationFactor as number) ?? 252],
  getColor: (colors) => colors.palette.i8,
})

@Indicator({
  name: 'hv',
  displayName: 'HV',
  category: 'oscillator',
  indicatorType: 'volatility',
  defaultPaneId: 'sub_HV',
  scale: { indicatorKey: 'hv', label: 'HV', decimals: 2 },
  getTitleInfo: getHVTitleInfo,
  visibleState: { compose: createNonNegativeSparseVisibleStateComposer('hv', EMPTY_HV_STATE) },
  runtime: {
    defaultConfig: { period: 20, annualizationFactor: 252, showHV: true },
    computeKey: 'calcHVData',
    compute: (data, c) => calcHVData(data, c.period, c.annualizationFactor),
  },
})
class HVIndicatorDefinition {
  static rendererFactory = createHVRendererPlugin
}
