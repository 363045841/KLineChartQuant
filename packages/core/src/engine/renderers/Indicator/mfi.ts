import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import { calcMFIData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../../indicators/scheduler'
import type { MFIRenderState } from '../../indicators/state/mfiState'
import { createMFIStateKey, EMPTY_MFI_STATE } from '../../indicators/state/mfiState'
import { createFixedRangeSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createSingleLineTitleInfo } from './shared/titleInfo'

type LinePoint = { x: number; y: number }

function getMFIStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn(`[MFIRenderer] Scheduler not available via service locator`)
    return null
  }
  const meta = scheduler.getIndicatorMetadata('mfi')
  if (!meta) {
    console.warn(`[MFIRenderer] Indicator metadata for 'mfi' not found, skip rendering`)
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

function createMFIRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
  const { paneId = 'sub_MFI' } = options
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getMFIStateKey(pluginHost, paneId)
  }
  return {
    name: `mfi_${paneId}`,
    version: '1.1.0',
    description: 'MFI 资金流强弱渲染器（WebGL + Canvas2D 回退，80/20 超买超卖线）',
    debugName: 'MFI',
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
      const state = context.indicatorStateReader?.get<MFIRenderState>(stateKey)
      if (!state || !state.params.showMFI || state.visibleMin > state.visibleMax) return

      const { valueMin, valueMax, series } = state
      const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
      const displayMin = displayRange.minPrice
      const displayMax = displayRange.maxPrice
      const displayValueRange = displayMax - displayMin || 1
      const paneH = pane.height
      const invRange = paneH / displayValueRange
      const rangeStart = range.start
      const toY = (v: number) => paneH - (v - displayMin) * invRange

      // 80 / 20 reference lines（复用 CCI 超买超卖 token：语义同为买卖压力带）
      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.cci.overbought
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(scrollLeft, toY(80))
      ctx.lineTo(scrollLeft + context.paneWidth, toY(80))
      ctx.stroke()
      ctx.strokeStyle = colors.cci.oversold
      ctx.beginPath()
      ctx.moveTo(scrollLeft, toY(20))
      ctx.lineTo(scrollLeft + context.paneWidth, toY(20))
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
        points.push({ x: centerX, y: toY(value) })
      }

      if (points.length < 2) return

      if (tryDrawLinesGpu(context, [{ points, width: 1, color: colors.palette.i5 }], scrollLeft))
        return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.palette.i5
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
        .get<MFIRenderState>(stateKey)
      return state?.params ?? {}
    },
    setConfig() {},
  }
}

const getMFITitleInfo = createSingleLineTitleInfo({
  createStateKey: createMFIStateKey,
  name: 'MFI',
  defaultPeriod: 14,
  getColor: (colors) => colors.palette.i5,
})

@Indicator({
  name: 'mfi',
  displayName: 'MFI',
  category: 'volume',
  indicatorType: 'volume',
  defaultPaneId: 'sub_MFI',
  visibleState: { compose: createFixedRangeSparseVisibleStateComposer('mfi', EMPTY_MFI_STATE) },
  scale: { indicatorKey: 'mfi', label: 'MFI', decimals: 2 },
  getTitleInfo: getMFITitleInfo,
  presentation: { defaultOptions: { showMFI: true } },
  runtime: {
    defaultParams: { period: 14 },
    computeKey: 'calcMFIData',
    compute: (data, c) => calcMFIData(data, c.period),
  },
})
export class MFIIndicatorDefinition {
  static rendererFactory = createMFIRendererPlugin
}
