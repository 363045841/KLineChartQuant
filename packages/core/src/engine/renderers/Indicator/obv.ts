import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import { calcOBVData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../../indicators/scheduler'
import type { OBVRenderState } from '../../indicators/state/obvState'
import { createOBVStateKey, EMPTY_OBV_STATE } from '../../indicators/state/obvState'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createSingleLineTitleInfo } from './shared/titleInfo'

type LinePoint = { x: number; y: number }

function getOBVStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn(`[OBVRenderer] Scheduler not available via service locator`)
    return null
  }
  const meta = scheduler.getIndicatorMetadata('obv')
  if (!meta) {
    console.warn(`[OBVRenderer] Indicator metadata for 'obv' not found, skip rendering`)
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

function createOBVRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
  const { paneId = 'sub_OBV' } = options
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getOBVStateKey(pluginHost, paneId)
  }
  return {
    name: `obv_${paneId}`,
    version: '1.1.0',
    description: 'OBV 能量潮渲染器（WebGL + Canvas2D 回退）',
    debugName: 'OBV',
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
      const state = context.indicatorStateReader?.get<OBVRenderState>(stateKey)
      if (!state || !state.params.showOBV || state.visibleMin > state.visibleMax) return

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

      if (tryDrawLinesGpu(context, [{ points, width: 1, color: colors.palette.i3 }], scrollLeft))
        return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.palette.i3
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
        .get<OBVRenderState>(stateKey)
      return state?.params ?? {}
    },
    setConfig() {},
  }
}

const getOBVTitleInfo = createSingleLineTitleInfo({
  createStateKey: createOBVStateKey,
  name: 'OBV',
  getColor: (colors) => colors.palette.i3,
})

@Indicator({
  name: 'obv',
  displayName: 'OBV',
  category: 'volume',
  indicatorType: 'volume',
  defaultPaneId: 'sub_OBV',
  visibleState: { compose: createSparseVisibleStateComposer('obv', EMPTY_OBV_STATE) },
  scale: { indicatorKey: 'obv', label: 'OBV', decimals: 0 },
  getTitleInfo: getOBVTitleInfo,
  presentation: { defaultOptions: { showOBV: true } },
  runtime: {
    defaultParams: {},
    computeKey: 'calcOBVData',
    compute: (data, c) => calcOBVData(data),
  },
})
export class OBVIndicatorDefinition {
  static rendererFactory = createOBVRendererPlugin
}
