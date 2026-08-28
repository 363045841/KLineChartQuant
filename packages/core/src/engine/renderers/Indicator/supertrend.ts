import type {
  IndicatorRenderStateReader,
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors, type ColorTokens } from '../../../foundation/tokens/index'
import type { KLineData } from '../../../foundation/types/price'
import { calcSuperTrendData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import {
  resolveStateKey,
  type TitleInfo,
  type GetTitleInfoFn,
} from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../../indicators/scheduler'
import type { SuperTrendRenderState } from '../../indicators/state/supertrendState'
import {
  createSuperTrendStateKey,
  EMPTY_SUPERTREND_STATE,
} from '../../indicators/state/supertrendState'
import { createValuePointVisibleStateComposer } from '../../indicators/visibleStateComposers'

interface SuperTrendRendererOptions {
  paneId?: string
}

function getSuperTrendStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn(`[SuperTrendRenderer] Scheduler not available via service locator`)
    return null
  }
  const meta = scheduler.getIndicatorMetadata('supertrend')
  if (!meta) {
    console.warn(
      `[SuperTrendRenderer] Indicator metadata for 'supertrend' not found, skip rendering`,
    )
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

function createSuperTrendRendererPlugin(
  options: SuperTrendRendererOptions = {},
): RendererPluginWithHost {
  const { paneId = 'sub_SuperTrend' } = options
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getSuperTrendStateKey(pluginHost, paneId)
  }

  return {
    name: `supertrend_${paneId}`,
    version: '1.0.0',
    description: 'SuperTrend ATR 趋势带渲染器（趋势翻转处颜色切换）',
    debugName: 'SuperTrend',
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
      const state = context.indicatorStateReader?.get<SuperTrendRenderState>(stateKey)
      if (!state || !state.params.showSuperTrend || state.visibleMin > state.visibleMax) return

      const { series } = state

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.lineWidth = 1
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'

      const drawEnd = Math.min(range.end, series.length)
      let prevX: number | null = null
      let prevY: number | null = null
      let prevTrend: 'up' | 'down' | null = null

      for (let i = range.start; i < drawEnd; i++) {
        const point = series[i]
        if (point === undefined) continue
        const centerX = kLineCenters[i - range.start]
        if (centerX === undefined) continue
        const y = pane.yAxis.priceToY(point.value)

        if (prevX !== null && prevTrend === point.trend) {
          ctx.strokeStyle = point.trend === 'up' ? colors.candleUpBody : colors.candleDownBody
          ctx.beginPath()
          ctx.moveTo(prevX, prevY!)
          ctx.lineTo(centerX, y)
          ctx.stroke()
        }

        prevX = centerX
        prevY = y
        prevTrend = point.trend
      }
      ctx.restore()
    },

    getConfig() {
      const stateKey = resolveKey()
      if (!stateKey) return {}
      const state = pluginHost
        ?.getService<IndicatorScheduler>('indicatorScheduler')
        ?.createRenderStateReader()
        .get<SuperTrendRenderState>(stateKey)
      return state?.params ?? {}
    },
    setConfig() {},
  }
}

function getSuperTrendTitleInfo(
  _data: KLineData[],
  index: number | null,
  params: Record<string, number | boolean | string>,
  stateReader: IndicatorRenderStateReader,
  paneId: string,
  colors: ColorTokens,
): TitleInfo | null {
  if (index === null) return null
  const state = stateReader.get<SuperTrendRenderState>(createSuperTrendStateKey(paneId))
  const p = state?.series[index]
  if (!p) return null

  return {
    name: 'SuperTrend',
    params: [(params.atrPeriod as number) ?? 10, (params.multiplier as number) ?? 3],
    values: [
      {
        label: p.trend === 'up' ? 'Up' : 'Down',
        value: p.value,
        color: p.trend === 'up' ? colors.candleUpBody : colors.candleDownBody,
      },
    ],
  }
}

@Indicator({
  name: 'supertrend',
  displayName: 'SuperTrend',
  getTitleInfo: getSuperTrendTitleInfo,
  category: 'main',
  indicatorType: 'trend',
  defaultPaneId: 'sub_SuperTrend',
  allowMainPane: true,
  mainPane: {
    rendererName: 'supertrend_main',
    toActiveConfig: (params, active) => ({ ...params, showSuperTrend: active }),
  },
  scale: { indicatorKey: 'supertrend', label: 'SuperTrend', decimals: 2 },
  visibleState: {
    compose: createValuePointVisibleStateComposer('supertrend', EMPTY_SUPERTREND_STATE, ['value']),
  },
  presentation: { defaultOptions: { showSuperTrend: true } },
  runtime: {
    defaultParams: { atrPeriod: 10, multiplier: 3 },
    computeKey: 'calcSuperTrendData',
    compute: (data, c) => calcSuperTrendData(data, c.atrPeriod, c.multiplier),
  },
})
export class SuperTrendIndicatorDefinition {
  static rendererFactory = createSuperTrendRendererPlugin
}
