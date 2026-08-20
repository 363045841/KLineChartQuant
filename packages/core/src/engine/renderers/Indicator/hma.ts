import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import { calcHMAData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, HMASchedulerConfig } from '../../indicators/scheduler'
import type { HMARenderState } from '../../indicators/state/hmaState'
import { createHMAStateKey, EMPTY_HMA_STATE } from '../../indicators/state/hmaState'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createSingleLineTitleInfo } from './shared/titleInfo'

type Point = { x: number; y: number }

interface HMARendererOptions {
  paneId?: string
}

function getHMAStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn('[HMARenderer] Scheduler not available via service locator')
    return null
  }
  const meta = scheduler.getIndicatorMetadata('hma')
  if (!meta) {
    console.warn("[HMARenderer] Indicator metadata for 'hma' not found, skip rendering")
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

function createHMARendererPlugin(options: HMARendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'main' } = options
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getHMAStateKey(pluginHost, paneId)
  }

  return {
    name: `hma_${paneId}`,
    version: '1.1.0',
    description: 'HMA Hull 移动均线渲染器（WebGL + Canvas2D 回退）',
    debugName: 'HMA',
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
      const state = context.indicatorStateReader?.get<HMARenderState>(stateKey)
      if (!state || !state.params.showHMA || state.visibleMin > state.visibleMax) return

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
      const state = pluginHost
        ?.getService<IndicatorScheduler>('indicatorScheduler')
        ?.createRenderStateReader()
        .get<HMARenderState>(stateKey)
      return state?.params ?? {}
    },

    setConfig() {
      // no-op
    },
  }
}

const getHMATitleInfo = createSingleLineTitleInfo({
  createStateKey: createHMAStateKey,
  name: 'HMA',
  getParams: (p) => [p.period as number],
  getColor: (colors) => colors.palette.i4,
})

@Indicator({
  name: 'hma',
  displayName: 'HMA',
  getTitleInfo: getHMATitleInfo,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 'hma_main',
    toActiveConfig: (params, active) => ({ ...params, showHMA: active }),
  },
  visibleState: { compose: createSparseVisibleStateComposer('hma', EMPTY_HMA_STATE) },
  scale: { indicatorKey: 'hma', label: 'HMA', decimals: 2 },
  runtime: {
    defaultConfig: { period: 14, showHMA: true },
    computeKey: 'calcHMAData',
    compute: (data, c) => calcHMAData(data, c.period),
  },
})
export class HMADefinition {
  static rendererFactory = createHMARendererPlugin
}
