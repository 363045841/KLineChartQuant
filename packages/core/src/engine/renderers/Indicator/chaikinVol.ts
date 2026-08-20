import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import { calcChaikinVolData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, ChaikinVolSchedulerConfig } from '../../indicators/scheduler'
import type { ChaikinVolRenderState } from '../../indicators/state/chaikinVolState'
import {
  createChaikinVolStateKey,
  EMPTY_CHAIKIN_VOL_STATE,
} from '../../indicators/state/chaikinVolState'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createSingleLineTitleInfo } from './shared/titleInfo'

type LinePoint = { x: number; y: number }

function getChaikinVolStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn(`[ChaikinVolRenderer] Scheduler not available via service locator`)
    return null
  }
  const meta = scheduler.getIndicatorMetadata('chaikinVol')
  if (!meta) {
    console.warn(
      `[ChaikinVolRenderer] Indicator metadata for 'chaikinVol' not found, skip rendering`,
    )
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

function createChaikinVolRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
  const { paneId = 'sub_ChaikinVol' } = options
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getChaikinVolStateKey(pluginHost, paneId)
  }

  return {
    name: `chaikinVol_${paneId}`,
    version: '1.1.0',
    description: 'Chaikin Volatility 渲染器（WebGL + Canvas2D 回退）',
    debugName: 'ChaikinVol',
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
      const state = context.indicatorStateReader?.get<ChaikinVolRenderState>(stateKey)
      if (!state || !state.params.showChaikinVol || state.visibleMin > state.visibleMax) return

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

      if (tryDrawLinesGpu(context, [{ points, width: 1, color: colors.palette.i2 }], scrollLeft))
        return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.palette.i2
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
        .get<ChaikinVolRenderState>(stateKey)
      return state?.params ?? {}
    },
    setConfig() {},
  }
}

const getChaikinVolTitleInfo = createSingleLineTitleInfo({
  createStateKey: createChaikinVolStateKey,
  name: 'ChaikinVol',
  getParams: (p) => [(p.emaPeriod as number) ?? 10, (p.rocPeriod as number) ?? 10],
  getColor: (colors) => colors.palette.i2,
})

@Indicator({
  name: 'chaikinVol',
  displayName: 'ChaikinVol',
  category: 'oscillator',
  indicatorType: 'volatility',
  defaultPaneId: 'sub_ChaikinVol',
  visibleState: {
    compose: createSparseVisibleStateComposer('chaikinVol', EMPTY_CHAIKIN_VOL_STATE),
  },
  scale: { indicatorKey: 'chaikinVol', label: 'ChaikinVol', decimals: 2 },
  getTitleInfo: getChaikinVolTitleInfo,
  runtime: {
    defaultConfig: { emaPeriod: 10, rocPeriod: 10, showChaikinVol: true },
    computeKey: 'calcChaikinVolData',
    compute: (data, c) => calcChaikinVolData(data, c.emaPeriod, c.rocPeriod),
  },
})
export class ChaikinVolIndicatorDefinition {
  static rendererFactory = createChaikinVolRendererPlugin
}
