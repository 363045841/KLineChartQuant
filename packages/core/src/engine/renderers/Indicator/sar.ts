import type { IndicatorRenderStateReader, RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { type ColorTokens, resolveThemeColors } from '@/foundation/tokens/index.js'
import type { KLineData } from '@/foundation/types/price.js'
import type { Layer } from '@/rendering/scene/types.js'
import { calcSARData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDecorator.js'
import {
  type GetTitleInfoFn,
  IndicatorKind,
  type TitleInfo,
} from '../../indicators/indicatorMetadata.js'
import type { SARRenderState } from '../../indicators/state/sarState.js'
import { EMPTY_SAR_STATE } from '../../indicators/state/sarState.js'
import { createValuePointVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { createIndicatorRendererLayer } from './shared/indicatorRendererLayer.js'

const DOT_RADIUS = 1.5
const TAU = Math.PI * 2

interface SARRendererOptions {
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

function createSARLayer(options: SARRendererOptions = {}): Layer<RenderContext> {
  const { paneId = 'main', instanceId } = options
  return createIndicatorRendererLayer({
    definitionId: 'sar',
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
      const state = context.indicatorStateReader?.get<SARRenderState>(instanceId)
      if (!state || !state.params.showSAR || state.visibleMin > state.visibleMax) return

      const { series } = state

      ctx.save()
      ctx.translate(-scrollLeft, 0)

      const drawEnd = Math.min(range.end, series.length)
      for (let i = range.start; i < drawEnd; i++) {
        const point = series[i]
        if (point === undefined) continue
        const centerX = kLineCenters[i - range.start]
        if (centerX === undefined) continue
        const y = pane.yAxis.priceToY(point.value)
        ctx.fillStyle = point.trend === 'up' ? colors.candleUpBody : colors.candleDownBody
        ctx.beginPath()
        ctx.arc(centerX, y, DOT_RADIUS, 0, TAU)
        ctx.fill()
      }

      ctx.restore()
    },
  })
}

function getSARTitleInfo(
  _data: KLineData[],
  index: number | null,
  params: Record<string, number | boolean | string>,
  stateReader: IndicatorRenderStateReader,
  instanceId: string,
  _paneId: string,
  colors: ColorTokens,
): TitleInfo | null {
  if (index === null) return null
  const state = stateReader.get<SARRenderState>(instanceId)
  const p = state?.series[index]
  if (!p) return null

  return {
    name: 'SAR',
    params: [(params.step as number) ?? 0.02, (params.maxStep as number) ?? 0.2],
    values: [
      {
        label: 'SAR',
        value: p.value,
        color: p.trend === 'up' ? colors.candleUpBody : colors.candleDownBody,
      },
    ],
  }
}

@Indicator({
  name: 'sar',
  displayName: 'SAR',
  kind: IndicatorKind.Indicator,
  getTitleInfo: getSARTitleInfo,
  category: 'main',
  indicatorType: 'trend',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    toActiveConfig: (params, active) => ({ ...params, showSAR: active }),
  },
  scale: { indicatorKey: 'sar', label: 'SAR', decimals: 4 },
  visibleState: {
    compose: createValuePointVisibleStateComposer('sar', EMPTY_SAR_STATE, ['value']),
  },
  presentation: { defaultOptions: { showSAR: true } },
  runtime: {
    defaultParams: { step: 0.02, maxStep: 0.2 },
    computeKey: 'calcSARData',
    compute: (data, c) => calcSARData(data, c.step, c.maxStep),
  },
})
export class SARDefinition {
  static rendererFactory = createSARLayer
}
