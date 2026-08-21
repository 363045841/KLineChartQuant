import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import { calcPVTData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../../indicators/scheduler'
import type { PVTRenderState } from '../../indicators/state/pvtState'
import { createPVTStateKey, EMPTY_PVT_STATE } from '../../indicators/state/pvtState'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createSingleLineTitleInfo } from './shared/titleInfo'

type LinePoint = { x: number; y: number }

function getPVTStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn(`[PVTRenderer] Scheduler not available via service locator`)
    return null
  }
  const meta = scheduler.getIndicatorMetadata('pvt')
  if (!meta) {
    console.warn(`[PVTRenderer] Indicator metadata for 'pvt' not found, skip rendering`)
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

function createPVTRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
  const { paneId = 'sub_PVT' } = options
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getPVTStateKey(pluginHost, paneId)
  }
  return {
    name: `pvt_${paneId}`,
    version: '1.1.0',
    description: 'PVT 量价趋势渲染器（WebGL + Canvas2D 回退）',
    debugName: 'PVT',
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
      const state = context.indicatorStateReader?.get<PVTRenderState>(stateKey)
      if (!state || !state.params.showPVT || state.visibleMin > state.visibleMax) return

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
      const state = pluginHost
        ?.getService<IndicatorScheduler>('indicatorScheduler')
        ?.createRenderStateReader()
        .get<PVTRenderState>(stateKey)
      return state?.params ?? {}
    },
    setConfig() {},
  }
}

const getPVTTitleInfo = createSingleLineTitleInfo({
  createStateKey: createPVTStateKey,
  name: 'PVT',
  getColor: (colors) => colors.palette.i8,
})

@Indicator({
  name: 'pvt',
  displayName: 'PVT',
  category: 'volume',
  indicatorType: 'volume',
  defaultPaneId: 'sub_PVT',
  visibleState: { compose: createSparseVisibleStateComposer('pvt', EMPTY_PVT_STATE) },
  scale: { indicatorKey: 'pvt', label: 'PVT', decimals: 0 },
  getTitleInfo: getPVTTitleInfo,
  runtime: {
    defaultConfig: { showPVT: true },
    computeKey: 'calcPVTData',
    compute: (data, c) => calcPVTData(data),
  },
})
export class PVTIndicatorDefinition {
  static rendererFactory = createPVTRendererPlugin
}
