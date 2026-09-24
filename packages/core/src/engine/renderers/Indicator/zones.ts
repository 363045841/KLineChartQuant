import type {
  IndicatorRenderStateReader,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '../../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index.js'
import { type ColorTokens, resolveThemeColors } from '../../../foundation/tokens/index.js'
import { calcZonesData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import {
  type GetTitleInfoFn,
  type TitleInfo,
  type TitleValueItem,
} from '../../indicators/indicatorMetadata.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { ZonesRenderState } from '../../indicators/state/zonesState.js'
import { EMPTY_ZONES_STATE } from '../../indicators/state/zonesState.js'
import { createFixedUnitVisibleStateComposer } from '../../indicators/visibleStateComposers.js'

function createZonesRendererPlugin(
  options: { paneId?: string; instanceId?: string } = {},
): RendererPluginWithHost {
  const { paneId = 'main', instanceId } = options
  let pluginHost: PluginHost | null = null

  return {
    name: `zones_${paneId}`,
    version: '1.0.0',
    description: 'SMC 区域渲染器（FVG 缺口 + Order Blocks 订单块）',
    debugName: 'Zones',
    paneId,
    priority: RENDERER_PRIORITY.INDICATOR,
    onInstall(host) {
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
      const state = context.indicatorStateReader?.get<ZonesRenderState>(instanceId)
      if (!state) return
      const { showFVG, showOB, showFilledZones } = state.params
      if (!showFVG && !showOB) return

      const toY = (v: number) => pane.yAxis.priceToY(v)

      ctx.save()
      ctx.translate(-scrollLeft, 0)

      for (const zone of state.series) {
        const isFVG = zone.kind === 'FVG_BULL' || zone.kind === 'FVG_BEAR'
        const isOB = zone.kind === 'OB_BULL' || zone.kind === 'OB_BEAR'
        if (isFVG && !showFVG) continue
        if (isOB && !showOB) continue
        if (zone.endIndex !== undefined && !showFilledZones) continue

        const startIdx = zone.startIndex
        const endIdx = zone.endIndex ?? range.end - 1
        if (endIdx < range.start || startIdx >= range.end) continue

        const startX = kLineCenters[Math.max(startIdx, range.start) - range.start]
        const endX = kLineCenters[Math.min(endIdx, range.end - 1) - range.start]
        if (startX === undefined || endX === undefined) continue

        const yHigh = toY(zone.high)
        const yLow = toY(zone.low)
        const fill =
          zone.kind === 'FVG_BULL'
            ? colors.zones.fvgBullFill
            : zone.kind === 'FVG_BEAR'
              ? colors.zones.fvgBearFill
              : zone.kind === 'OB_BULL'
                ? colors.zones.obBullFill
                : colors.zones.obBearFill
        ctx.fillStyle = fill
        ctx.fillRect(startX, yHigh, endX - startX, yLow - yHigh)
      }

      ctx.restore()
    },
    getConfig() {
      if (!instanceId) return {}
      return (
        pluginHost
          ?.getService<IndicatorRenderStateReader>(INDICATOR_INSTANCE_STATE_SERVICE)
          ?.get<ZonesRenderState>(instanceId)?.params ?? {}
      )
    },
    setConfig() {},
  }
}

const getZonesTitleInfo: GetTitleInfoFn = (
  _data,
  index,
  _params,
  stateReader,
  instanceId,
  _paneId,
  colors,
) => {
  if (index === null) return null

  const state = stateReader.get<ZonesRenderState>(instanceId)
  if (!state) return null

  const activeZones = state.series.filter(
    (z) => z.startIndex <= index && (z.endIndex === undefined || z.endIndex >= index),
  )
  if (activeZones.length === 0) return null

  const values: TitleValueItem[] = activeZones.slice(0, 5).map((z) => ({
    label: z.kind,
    value: z.high,
    color:
      z.kind === 'FVG_BULL'
        ? colors.zones.fvgBullFill
        : z.kind === 'FVG_BEAR'
          ? colors.zones.fvgBearFill
          : z.kind === 'OB_BULL'
            ? colors.zones.obBullFill
            : colors.zones.obBearFill,
  }))

  return {
    name: 'Zones',
    params: [activeZones.length],
    values,
  }
}

@Indicator({
  name: 'zones',
  displayName: 'Zones',
  kind: IndicatorKind.Indicator,
  getTitleInfo: getZonesTitleInfo,
  category: 'main',
  indicatorType: 'structure',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 'zones_main',
    toActiveConfig: (params, active) => ({
      ...params,
      showFVG: active,
      showOB: active,
      showFilledZones: active,
    }),
  },
  scale: { indicatorKey: 'zones', label: 'Zones', decimals: 2 },
  visibleState: { compose: createFixedUnitVisibleStateComposer('zones', EMPTY_ZONES_STATE) },
  presentation: { defaultOptions: { showFVG: true, showOB: true, showFilledZones: true } },
  runtime: {
    outputAlignment: 'aggregate',
    defaultParams: { obLookback: 20 },
    computeKey: 'calcZonesData',
    compute: (data, c) => calcZonesData(data, c.obLookback, 5, 2, 'close'),
  },
})
export class ZonesDefinition {
  static rendererFactory = createZonesRendererPlugin
}
