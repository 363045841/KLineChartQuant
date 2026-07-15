import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import { calcParkinsonData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, ParkinsonSchedulerConfig } from '../../indicators/scheduler'
import type { ParkinsonRenderState } from '../../indicators/state/parkinsonState'
import { createParkinsonStateKey } from '../../indicators/state/parkinsonState'
import { EMPTY_PARKINSON_STATE } from '../../indicators/state/parkinsonState'
import { createNonNegativeSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'

import { createSingleLineTitleInfo } from './shared/titleInfo'

const PARKINSON_COLOR = '#0891b2'

type LinePoint = { x: number; y: number }

function getParkinsonStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn(`[ParkinsonRenderer] Scheduler not available via service locator`)
    return null
  }
  const meta = scheduler.getIndicatorMetadata('parkinson')
  if (!meta) {
    console.warn(`[ParkinsonRenderer] Indicator metadata for 'parkinson' not found, skip rendering`)
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

function createParkinsonRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
  const { paneId = 'sub_Parkinson' } = options
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getParkinsonStateKey(pluginHost, paneId)
  }

  return {
    name: `parkinson_${paneId}`,
    version: '1.1.0',
    description: 'Parkinson 波动率渲染器（WebGL + Canvas2D 回退）',
    debugName: 'Parkinson',
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
      const { ctx, pane, range, scrollLeft, kLineCenters, lineWebGLSurface } = context
      const stateKey = resolveKey()
      if (!stateKey) return
      const state = pluginHost?.getSharedState<ParkinsonRenderState>(stateKey)
      if (!state || !state.params.showParkinson || state.visibleMin > state.visibleMax) return

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

      const enableWebGL = context.settings?.enableWebGLRendering !== false
      let usedWebGL = false
      if (enableWebGL && lineWebGLSurface?.isAvailable()) {
        const allOk = lineWebGLSurface.drawLineStrips(
          [{ points, width: 1, color: PARKINSON_COLOR }],
          scrollLeft,
        )
        if (allOk) {
          usedWebGL = true
          lineWebGLSurface.compositeTo(ctx, { imageSmoothingEnabled: false })
        }
      }

      if (usedWebGL) return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = PARKINSON_COLOR
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
      const state = pluginHost?.getSharedState<ParkinsonRenderState>(stateKey)
      return state?.params ?? {}
    },
    setConfig() {},
  }
}

const getParkinsonTitleInfo = createSingleLineTitleInfo({
  createStateKey: createParkinsonStateKey,
  name: 'Parkinson',
  getParams: (p) => [(p.period as number) ?? 20, (p.annualizationFactor as number) ?? 252],
  color: PARKINSON_COLOR,
})

@Indicator({
  name: 'parkinson',
  displayName: 'Parkinson',
  category: 'oscillator',
  defaultPaneId: 'sub_Parkinson',
  scale: { indicatorKey: 'parkinson', label: 'Parkinson', decimals: 2 },
  getTitleInfo: getParkinsonTitleInfo,
  visibleState: {
    compose: createNonNegativeSparseVisibleStateComposer('parkinson', EMPTY_PARKINSON_STATE),
  },
  runtime: {
    defaultConfig: { period: 20, annualizationFactor: 252, showParkinson: true },
    computeKey: 'calcParkinsonData',
    compute: (data, c) => calcParkinsonData(data, c.period, c.annualizationFactor),
  },
})
class ParkinsonIndicatorDefinition {
  static rendererFactory = createParkinsonRendererPlugin
}
