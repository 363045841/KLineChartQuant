import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import { calcCMFData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../../indicators/scheduler'
import type { CMFRenderState } from '../../indicators/state/cmfState'
import { createCMFStateKey, EMPTY_CMF_STATE } from '../../indicators/state/cmfState'
import { createFixedRangeSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createSingleLineTitleInfo } from './shared/titleInfo'

type LinePoint = { x: number; y: number }

function getCMFStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn(`[CMFRenderer] Scheduler not available via service locator`)
    return null
  }
  const meta = scheduler.getIndicatorMetadata('cmf')
  if (!meta) {
    console.warn(`[CMFRenderer] Indicator metadata for 'cmf' not found, skip rendering`)
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

function createCMFRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
  const { paneId = 'sub_CMF' } = options
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getCMFStateKey(pluginHost, paneId)
  }
  return {
    name: `cmf_${paneId}`,
    version: '1.1.0',
    description: 'CMF Chaikin 资金流渲染器（WebGL + Canvas2D 回退）',
    debugName: 'CMF',
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
      const state = context.indicatorStateReader?.get<CMFRenderState>(stateKey)
      if (!state || !state.params.showCMF || state.visibleMin > state.visibleMax) return

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
      ctx.strokeStyle = colors.referenceLine.neutral
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
      const state = pluginHost
        ?.getService<IndicatorScheduler>('indicatorScheduler')
        ?.createRenderStateReader()
        .get<CMFRenderState>(stateKey)
      return state?.params ?? {}
    },
    setConfig() {},
  }
}

const getCMFTitleInfo = createSingleLineTitleInfo({
  createStateKey: createCMFStateKey,
  name: 'CMF',
  defaultPeriod: 20,
  getColor: (colors) => colors.palette.i6,
})

@Indicator({
  name: 'cmf',
  displayName: 'CMF',
  category: 'volume',
  indicatorType: 'volume',
  defaultPaneId: 'sub_CMF',
  visibleState: { compose: createFixedRangeSparseVisibleStateComposer('cmf', EMPTY_CMF_STATE) },
  scale: { indicatorKey: 'cmf', label: 'CMF', decimals: 4 },
  getTitleInfo: getCMFTitleInfo,
  runtime: {
    defaultConfig: { period: 20, showCMF: true },
    computeKey: 'calcCMFData',
    compute: (data, c) => calcCMFData(data, c.period),
  },
})
export class CMFIndicatorDefinition {
  static rendererFactory = createCMFRendererPlugin
}
