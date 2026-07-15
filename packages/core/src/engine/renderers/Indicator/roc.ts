import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import { calcROCData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, ROCSchedulerConfig } from '../../indicators/scheduler'
import type { ROCRenderState } from '../../indicators/state/rocState'
import { createROCStateKey, EMPTY_ROC_STATE } from '../../indicators/state/rocState'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createSingleLineTitleInfo } from './shared/titleInfo'

const ROC_COLOR = '#0ea5e9'

type LinePoint = { x: number; y: number }

interface ROCRendererOptions {
  paneId?: string
}

function getROCStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn(`[ROCRenderer] Scheduler not available via service locator`)
    return null
  }
  const meta = scheduler.getIndicatorMetadata('roc')
  if (!meta) {
    console.warn(`[ROCRenderer] Indicator metadata for 'roc' not found, skip rendering`)
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

function createROCRendererPlugin(options: ROCRendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'sub_ROC' } = options
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getROCStateKey(pluginHost, paneId)
  }

  return {
    name: `roc_${paneId}`,
    version: '1.1.0',
    description: 'ROC 变化率渲染器（WebGL + Canvas2D 回退）',
    debugName: 'ROC',
    paneId,
    priority: RENDERER_PRIORITY.MAIN,

    onInstall(host: PluginHost) {
      pluginHost = host
    },
    getDeclaredNamespaces() {
      const key = resolveKey()
      return key ? [key] : []
    },

    draw(context: RenderContext) {
      const { ctx, pane, range, scrollLeft, kLineCenters } = context
      const stateKey = resolveKey()
      if (!stateKey) return
      const state = pluginHost?.getSharedState<ROCRenderState>(stateKey)
      if (!state || !state.params.showROC || state.visibleMin > state.visibleMax) return

      const { valueMin, valueMax, series } = state
      const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
      const displayMin = displayRange.minPrice
      const displayMax = displayRange.maxPrice
      const displayValueRange = displayMax - displayMin || 1
      const paneH = pane.height
      const invRange = paneH / displayValueRange
      const rangeStart = range.start

      // Zero line
      const zeroY = paneH - (0 - displayMin) * invRange
      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(scrollLeft, zeroY)
      ctx.lineTo(scrollLeft + context.paneWidth, zeroY)
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
        points.push({ x: centerX, y: paneH - (value - displayMin) * invRange })
      }

      if (points.length < 2) return

      if (tryDrawLinesGpu(context, [{ points, width: 1, color: ROC_COLOR }], scrollLeft)) return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = ROC_COLOR
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
      const state = pluginHost?.getSharedState<ROCRenderState>(stateKey)
      return state?.params ?? {}
    },
    setConfig() {},
  }
}

const getROCTitleInfo = createSingleLineTitleInfo({
  createStateKey: createROCStateKey,
  name: 'ROC',
  defaultPeriod: 12,
  color: ROC_COLOR,
})

@Indicator({
  name: 'roc',
  displayName: 'ROC',
  category: 'oscillator',
  defaultPaneId: 'sub_ROC',
  visibleState: { compose: createSparseVisibleStateComposer('roc', EMPTY_ROC_STATE) },
  scale: { indicatorKey: 'roc', label: 'ROC', decimals: 2 },
  getTitleInfo: getROCTitleInfo,
  runtime: {
    defaultConfig: { period: 12, showROC: true },
    computeKey: 'calcROCData',
    compute: (data, c) => calcROCData(data, c.period),
  },
})
class ROCIndicatorDefinition {
  static rendererFactory = createROCRendererPlugin
}
