import type {
  IndicatorRenderStateReader,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '../../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index.js'
import { type ColorTokens, resolveThemeColors } from '../../../foundation/tokens/index.js'
import type { KLineData } from '../../../foundation/types/price.js'
import { calcVolumeProfileData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import type { TitleInfo } from '../../indicators/indicatorMetadata.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { VolumeProfileRenderState } from '../../indicators/state/volumeProfileState.js'
import { EMPTY_VOLUME_PROFILE_STATE } from '../../indicators/state/volumeProfileState.js'
import { createVolumeProfileVisibleStateComposer } from '../../indicators/visibleStateComposers.js'

const PROFILE_WIDTH_PX = 80

function createVolumeProfileRendererPlugin(
  options: { paneId?: string; instanceId?: string } = {},
): RendererPluginWithHost {
  const { paneId = 'sub_VolumeProfile', instanceId } = options
  let pluginHost: PluginHost | null = null

  return {
    name: `volumeProfile_${paneId}`,
    version: '1.0.0',
    description: 'Volume Profile 渲染器（POC + Value Area + 价格-成交量直方图）',
    debugName: 'VolumeProfile',
    paneId,
    priority: RENDERER_PRIORITY.INDICATOR,
    onInstall(host) {
      pluginHost = host
    },
    getDeclaredNamespaces() {
      return instanceId ? [instanceId] : []
    },
    draw(context: RenderContext) {
      const { ctx, pane, scrollLeft } = context
      // 颜色统一取自 theme tokens，保证与标题栏一致并支持主题/预设切换
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      if (!instanceId) return
      const state = context.indicatorStateReader?.get<VolumeProfileRenderState>(instanceId)
      if (!state) return
      const { bins, poc, vah, val, totalVolume } = state.series
      if (bins.length === 0 || totalVolume <= 0) return
      const { showPOC, showValueArea } = state.params

      const displayRange = pane.yAxis.getDisplayRange()
      const displayMin = displayRange.minPrice
      const displayValueRange = displayRange.maxPrice - displayMin || 1
      const toY = (v: number) => pane.height - ((v - displayMin) / displayValueRange) * pane.height

      const maxBinVolume = Math.max(...bins.map((b) => b.volume))
      if (maxBinVolume <= 0) return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      const profileX = scrollLeft + context.paneWidth - PROFILE_WIDTH_PX

      ctx.fillStyle = colors.volumeProfileFill
      for (const bin of bins) {
        const yTop = toY(bin.priceHigh)
        const yBot = toY(bin.priceLow)
        const barWidth = (bin.volume / maxBinVolume) * PROFILE_WIDTH_PX
        ctx.fillRect(profileX, yTop, barWidth, yBot - yTop)
      }

      if (showValueArea) {
        ctx.strokeStyle = colors.volumeProfileValueArea
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        const vahY = toY(vah)
        const valY = toY(val)
        ctx.beginPath()
        ctx.moveTo(scrollLeft, vahY)
        ctx.lineTo(scrollLeft + context.paneWidth, vahY)
        ctx.moveTo(scrollLeft, valY)
        ctx.lineTo(scrollLeft + context.paneWidth, valY)
        ctx.stroke()
        ctx.setLineDash([])
      }

      if (showPOC) {
        ctx.strokeStyle = colors.volumeProfilePoc
        ctx.lineWidth = 1
        const pocY = toY(poc)
        ctx.beginPath()
        ctx.moveTo(scrollLeft, pocY)
        ctx.lineTo(scrollLeft + context.paneWidth, pocY)
        ctx.stroke()
      }

      ctx.restore()
    },
    getConfig() {
      if (!instanceId) return {}
      const state = pluginHost
        ?.getService<IndicatorRenderStateReader>(INDICATOR_INSTANCE_STATE_SERVICE)
        ?.get<VolumeProfileRenderState>(instanceId)
      return state?.params ?? {}
    },
    setConfig() {},
  }
}

function getVolumeProfileTitleInfo(
  _data: KLineData[],
  index: number | null,
  params: Record<string, number | boolean | string>,
  stateReader: IndicatorRenderStateReader,
  instanceId: string,
  _paneId: string,
  colors: ColorTokens,
): TitleInfo | null {
  if (index === null) return null
  const bins = (params.bins as number) ?? 24
  const state = stateReader.get<VolumeProfileRenderState>(instanceId)
  const vp = state?.series

  const values: Array<{ label: string; value: number; color: string }> = []
  if (vp && vp.bins.length > 0) {
    if (state.params.showPOC) {
      values.push({ label: 'POC', value: vp.poc, color: colors.volumeProfilePoc })
    }
    if (state.params.showValueArea) {
      values.push({ label: 'VAH', value: vp.vah, color: colors.volumeProfileValueArea })
      values.push({ label: 'VAL', value: vp.val, color: colors.volumeProfileValueArea })
    }
  }

  return {
    name: 'VP',
    params: [bins],
    values,
  }
}

@Indicator({
  name: 'volumeProfile',
  displayName: 'VP',
  kind: IndicatorKind.Indicator,
  category: 'volume',
  indicatorType: 'volume',
  defaultPaneId: 'sub_VolumeProfile',
  scale: { indicatorKey: 'volumeProfile', label: 'VP', decimals: 0 },
  getTitleInfo: getVolumeProfileTitleInfo,
  visibleState: {
    compose: createVolumeProfileVisibleStateComposer('volumeProfile', EMPTY_VOLUME_PROFILE_STATE),
  },
  presentation: { defaultOptions: { showPOC: true, showValueArea: true } },
  runtime: {
    outputAlignment: 'aggregate',
    defaultParams: { bins: 24, lookback: 100, valueAreaPercent: 70 },
    computeKey: 'calcVolumeProfileData',
    compute: (data, c) => calcVolumeProfileData(data, c.bins, c.lookback, c.valueAreaPercent),
  },
})
export class VolumeProfileIndicatorDefinition {
  static rendererFactory = createVolumeProfileRendererPlugin
}
