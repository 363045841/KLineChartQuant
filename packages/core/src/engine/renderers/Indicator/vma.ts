import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import { calcVMAData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, VMASchedulerConfig } from '../../indicators/scheduler'
import type { VMARenderState } from '../../indicators/state/vmaState'
import { createVMAStateKey } from '../../indicators/state/vmaState'
import { EMPTY_VMA_STATE } from '../../indicators/state/vmaState'
import { createNonNegativeSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createSingleLineTitleInfo } from './shared/titleInfo'

type LinePoint = { x: number; y: number }

function getVMAStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn(`[VMARenderer] Scheduler not available via service locator`)
    return null
  }
  const meta = scheduler.getIndicatorMetadata('vma')
  if (!meta) {
    console.warn(`[VMARenderer] Indicator metadata for 'vma' not found, skip rendering`)
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

function createVMARendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
  const { paneId = 'sub_VMA' } = options
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getVMAStateKey(pluginHost, paneId)
  }
  return {
    name: `vma_${paneId}`,
    version: '1.1.0',
    description: 'VMA 成交量均线渲染器（WebGL + Canvas2D 回退）',
    debugName: 'VMA',
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
      const state = pluginHost?.getSharedState<VMARenderState>(stateKey)
      if (!state || !state.params.showVMA || state.visibleMin > state.visibleMax) return

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
      const state = pluginHost?.getSharedState<VMARenderState>(stateKey)
      return state?.params ?? {}
    },
    setConfig() {},
  }
}

const getVMATitleInfo = createSingleLineTitleInfo({
  createStateKey: createVMAStateKey,
  name: 'VMA',
  defaultPeriod: 5,
  getColor: (colors) => colors.palette.i6,
})

@Indicator({
  name: 'vma',
  displayName: 'VMA',
  category: 'volume',
  indicatorType: 'volume',
  defaultPaneId: 'sub_VMA',
  scale: { indicatorKey: 'vma', label: 'VMA', decimals: 0 },
  getTitleInfo: getVMATitleInfo,
  visibleState: { compose: createNonNegativeSparseVisibleStateComposer('vma', EMPTY_VMA_STATE) },
  runtime: {
    defaultConfig: { period: 5, showVMA: true },
    computeKey: 'calcVMAData',
    compute: (data, c) => calcVMAData(data, c.period),
  },
})
class VMAIndicatorDefinition {
  static rendererFactory = createVMARendererPlugin
}
