/**
 * ALMA（Arnaud Legoux 移动平均）主图单线渲染器
 * 复用 WMA 渲染器骨架，多参数（period/offset/sigma），支持 WebGL + Canvas2D 回退
 */
import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { calcALMAData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../../indicators/scheduler'
import type { ALMARenderState } from '../../indicators/state/almaState'
import { createALMAStateKey, EMPTY_ALMA_STATE } from '../../indicators/state/almaState'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createSingleLineTitleInfo } from './shared/titleInfo'

const ALMA_COLOR = '#22c55e'

type Point = { x: number; y: number }

interface ALMARendererOptions {
  paneId?: string
}

function getALMAStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn('[ALMARenderer] Scheduler not available via service locator')
    return null
  }
  const meta = scheduler.getIndicatorMetadata('alma')
  if (!meta) {
    console.warn("[ALMARenderer] Indicator metadata for 'alma' not found, skip rendering")
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

function createALMARendererPlugin(options: ALMARendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'main' } = options
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getALMAStateKey(pluginHost, paneId)
  }

  return {
    name: `alma_${paneId}`,
    version: '1.1.0',
    description: 'ALMA Arnaud Legoux 移动均线渲染器（WebGL + Canvas2D 回退）',
    debugName: 'ALMA',
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
      const state = pluginHost?.getSharedState<ALMARenderState>(stateKey)
      if (!state || !state.params.showALMA || state.visibleMin > state.visibleMax) return

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

      if (tryDrawLinesGpu(context, [{ points, width: 1, color: ALMA_COLOR }], scrollLeft)) return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = ALMA_COLOR
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
      const state = pluginHost?.getSharedState<ALMARenderState>(stateKey)
      return state?.params ?? {}
    },

    setConfig() {
      // no-op
    },
  }
}

const getALMATitleInfo = createSingleLineTitleInfo({
  createStateKey: createALMAStateKey,
  name: 'ALMA',
  getParams: (p) => [p.period as number, p.offset as number, p.sigma as number],
  color: ALMA_COLOR,
})

@Indicator({
  name: 'alma',
  displayName: 'ALMA',
  getTitleInfo: getALMATitleInfo,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 'alma_main',
    toActiveConfig: (params, active) => ({ ...params, showALMA: active }),
  },
  visibleState: { compose: createSparseVisibleStateComposer('alma', EMPTY_ALMA_STATE) },
  scale: { indicatorKey: 'alma', label: 'ALMA', decimals: 2 },
  runtime: {
    defaultConfig: { period: 9, offset: 0.85, sigma: 6, showALMA: true },
    computeKey: 'calcALMAData',
    compute: (data, c) => calcALMAData(data, c.period, c.offset, c.sigma),
  },
})
class ALMADefinition {
  static rendererFactory = createALMARendererPlugin
}
