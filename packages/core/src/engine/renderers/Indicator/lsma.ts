import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import { calcLSMAData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, WMASchedulerConfig } from '../../indicators/scheduler'
import type { LSMARenderState } from '../../indicators/state/lsmaState'
import { createLSMAStateKey, EMPTY_LSMA_STATE } from '../../indicators/state/lsmaState'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createSingleLineTitleInfo } from './shared/titleInfo'

type Point = { x: number; y: number }

interface LSMARendererOptions {
  paneId?: string
}

function getLSMAStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn('[LSMARenderer] Scheduler not available via service locator')
    return null
  }
  const meta = scheduler.getIndicatorMetadata('lsma')
  if (!meta) {
    console.warn("[LSMARenderer] Indicator metadata for 'lsma' not found, skip rendering")
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

function createLSMARendererPlugin(options: LSMARendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'main' } = options
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getLSMAStateKey(pluginHost, paneId)
  }

  return {
    name: `lsma_${paneId}`,
    version: '1.1.0',
    description: 'LSMA 线性回归移动均线渲染器（WebGL + Canvas2D 回退）',
    debugName: 'LSMA',
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
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )

      const stateKey = resolveKey()
      if (!stateKey) return
      const state = pluginHost?.getSharedState<LSMARenderState>(stateKey)
      if (!state || !state.params.showLSMA || state.visibleMin > state.visibleMax) return

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

      if (tryDrawLinesGpu(context, [{ points, width: 1, color: colors.palette.i7 }], scrollLeft))
        return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.palette.i7
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
      const state = pluginHost?.getSharedState<LSMARenderState>(stateKey)
      return state?.params ?? {}
    },

    setConfig() {
      // no-op
    },
  }
}

const getLSMATitleInfo = createSingleLineTitleInfo({
  createStateKey: createLSMAStateKey,
  name: 'LSMA',
  getParams: (p) => [p.period as number],
  getColor: (colors) => colors.palette.i7,
})

@Indicator({
  name: 'lsma',
  displayName: 'LSMA',
  getTitleInfo: getLSMATitleInfo,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 'lsma_main',
    toActiveConfig: (params, active) => ({ ...params, showLSMA: active }),
  },
  visibleState: { compose: createSparseVisibleStateComposer('lsma', EMPTY_LSMA_STATE) },
  scale: { indicatorKey: 'lsma', label: 'LSMA', decimals: 2 },
  runtime: {
    defaultConfig: { period: 25, showLSMA: true },
    computeKey: 'calcLSMAData',
    compute: (data, c) => calcLSMAData(data, c.period),
  },
})
class LSMADefinition {
  static rendererFactory = createLSMARendererPlugin
}
