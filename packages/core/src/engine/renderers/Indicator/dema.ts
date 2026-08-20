import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import { calcDEMAData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, DEMASchedulerConfig } from '../../indicators/scheduler'
import type { DEMARenderState } from '../../indicators/state/demaState'
import { createDEMAStateKey, EMPTY_DEMA_STATE } from '../../indicators/state/demaState'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createSingleLineTitleInfo } from './shared/titleInfo'

type Point = { x: number; y: number }

interface DEMARendererOptions {
  paneId?: string
}

function getDEMAStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn('[DEMARenderer] Scheduler not available via service locator')
    return null
  }
  const meta = scheduler.getIndicatorMetadata('dema')
  if (!meta) {
    console.warn("[DEMARenderer] Indicator metadata for 'dema' not found, skip rendering")
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

function createDEMARendererPlugin(options: DEMARendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'main' } = options
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getDEMAStateKey(pluginHost, paneId)
  }

  return {
    name: `dema_${paneId}`,
    version: '1.1.0',
    description: 'DEMA 双重指数移动均线渲染器（WebGL + Canvas2D 回退）',
    debugName: 'DEMA',
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
      const state = context.indicatorStateReader?.get<DEMARenderState>(stateKey)
      if (!state || !state.params.showDEMA || state.visibleMin > state.visibleMax) return

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

      if (tryDrawLinesGpu(context, [{ points, width: 1, color: colors.palette.i9 }], scrollLeft))
        return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.palette.i9
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
        .get<DEMARenderState>(stateKey)
      return state?.params ?? {}
    },

    setConfig() {
      // no-op
    },
  }
}

const getDEMATitleInfo = createSingleLineTitleInfo({
  createStateKey: createDEMAStateKey,
  name: 'DEMA',
  getParams: (p) => [p.period as number],
  getColor: (colors) => colors.palette.i9,
})

@Indicator({
  name: 'dema',
  displayName: 'DEMA',
  getTitleInfo: getDEMATitleInfo,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 'dema_main',
    toActiveConfig: (params, active) => ({ ...params, showDEMA: active }),
  },
  visibleState: { compose: createSparseVisibleStateComposer('dema', EMPTY_DEMA_STATE) },
  scale: { indicatorKey: 'dema', label: 'DEMA', decimals: 2 },
  runtime: {
    defaultConfig: { period: 14, showDEMA: true },
    computeKey: 'calcDEMAData',
    compute: (data, c) => calcDEMAData(data, c.period),
  },
})
export class DEMADefinition {
  static rendererFactory = createDEMARendererPlugin
}
