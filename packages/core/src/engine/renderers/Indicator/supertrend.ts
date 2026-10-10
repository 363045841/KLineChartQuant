import type { IndicatorRenderStateReader, RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { type ColorTokens, resolveThemeColors } from '@/foundation/tokens/index.js'
import type { KLineData } from '@/foundation/types/price.js'
import type { Layer } from '@/rendering/scene/types.js'
import { calcSuperTrendData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDecorator.js'
import {
  type GetTitleInfoFn,
  IndicatorKind,
  type TitleInfo,
} from '../../indicators/indicatorMetadata.js'
import type { SuperTrendRenderState } from '../../indicators/state/supertrendState.js'
import { EMPTY_SUPERTREND_STATE } from '../../indicators/state/supertrendState.js'
import { createValuePointVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { createIndicatorRendererLayer } from './shared/indicatorRendererLayer.js'

interface SuperTrendRendererOptions {
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

function createSuperTrendLayer(options: SuperTrendRendererOptions = {}): Layer<RenderContext> {
  const { paneId = 'sub_SuperTrend', instanceId } = options
  return createIndicatorRendererLayer({
    definitionId: 'supertrend',
    paneId,
    z: RENDERER_PRIORITY.INDICATOR,
    draw(context) {
      const { ctx, pane, range, scrollLeft, kLineCenters } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      if (!instanceId) return
      const state = context.indicatorStateReader?.get<SuperTrendRenderState>(instanceId)
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
  })
}

function getSuperTrendTitleInfo(
  _data: KLineData[],
  index: number | null,
  params: Record<string, number | boolean | string>,
  stateReader: IndicatorRenderStateReader,
  instanceId: string,
  _paneId: string,
  colors: ColorTokens,
): TitleInfo | null {
  if (index === null) return null
  const state = stateReader.get<SuperTrendRenderState>(instanceId)
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
  kind: IndicatorKind.Indicator,
  getTitleInfo: getSuperTrendTitleInfo,
  category: 'main',
  indicatorType: 'trend',
  defaultPaneId: 'sub_SuperTrend',
  allowMainPane: true,
  mainPane: {
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
  static rendererFactory = createSuperTrendLayer
}
