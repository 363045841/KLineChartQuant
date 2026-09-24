import type {
  IndicatorRenderStateReader,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '../../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index.js'
import { type ColorTokens, resolveThemeColors } from '../../../foundation/tokens/index.js'
import type { KLineData } from '../../../foundation/types/price.js'
import { calcSARData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { type GetTitleInfoFn, type TitleInfo } from '../../indicators/indicatorMetadata.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { SARRenderState } from '../../indicators/state/sarState.js'
import { EMPTY_SAR_STATE } from '../../indicators/state/sarState.js'
import { createValuePointVisibleStateComposer } from '../../indicators/visibleStateComposers.js'

const DOT_RADIUS = 1.5
const TAU = Math.PI * 2

interface SARRendererOptions {
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

function createSARRendererPlugin(options: SARRendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'main', instanceId } = options
  let pluginHost: PluginHost | null = null

  return {
    name: `sar_${paneId}`,
    version: '1.0.0',
    description: 'Parabolic SAR 渲染器（绿色 = 多头止损 / 红色 = 空头止损）',
    debugName: 'SAR',
    paneId,
    priority: RENDERER_PRIORITY.INDICATOR,

    onInstall(host: PluginHost) {
      pluginHost = host
    },

    getDeclaredNamespaces() {
      return instanceId ? [instanceId] : []
    },

    draw(context: RenderContext) {
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

    getConfig() {
      if (!instanceId) return {}
      const state = pluginHost
        ?.getService<IndicatorRenderStateReader>(INDICATOR_INSTANCE_STATE_SERVICE)
        ?.get<SARRenderState>(instanceId)
      return state?.params ?? {}
    },

    setConfig() {
      // no-op
    },
  }
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
    rendererName: 'sar_main',
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
  static rendererFactory = createSARRendererPlugin
}
