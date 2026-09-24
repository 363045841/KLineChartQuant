import type {
  IndicatorRenderStateReader,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '../../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index.js'
import type { ColorTokens } from '../../../foundation/tokens/index.js'
import { resolveThemeColors } from '../../../foundation/tokens/index.js'
import type { KLineData } from '../../../foundation/types/price.js'
import { calcStructureData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import type { TitleInfo } from '../../indicators/indicatorMetadata.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { StructureRenderState } from '../../indicators/state/structureState.js'
import { EMPTY_STRUCTURE_STATE } from '../../indicators/state/structureState.js'
import { createFixedUnitVisibleStateComposer } from '../../indicators/visibleStateComposers.js'

const LABEL_FONT = '11px sans-serif'

function createStructureRendererPlugin(
  options: { paneId?: string; instanceId?: string } = {},
): RendererPluginWithHost {
  const { paneId = 'sub_Structure', instanceId } = options
  let pluginHost: PluginHost | null = null

  return {
    name: `structure_${paneId}`,
    version: '1.0.0',
    description: 'SMC 结构渲染器（swing 标签 + BOS/CHOCH 触发线）',
    debugName: 'Structure',
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
      const state = context.indicatorStateReader?.get<StructureRenderState>(instanceId)
      if (!state) return
      const params = state.params
      const { swings, events } = state.series
      if (!params.showSwingLabels && !params.showBOS && !params.showCHOCH) return

      const toY = (v: number) => pane.yAxis.priceToY(v)

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.font = LABEL_FONT
      ctx.textAlign = 'center'

      if (params.showSwingLabels) {
        for (const s of swings) {
          if (s.index < range.start || s.index >= range.end) continue
          if (!s.confirmed && !params.showProvisional) continue
          const centerX = kLineCenters[s.index - range.start]
          if (centerX === undefined) continue
          const y = toY(s.price)
          ctx.fillStyle =
            s.label === 'HH'
              ? colors.structure.hh
              : s.label === 'HL'
                ? colors.structure.hl
                : s.label === 'LH'
                  ? colors.structure.lh
                  : colors.structure.ll
          const labelY = s.kind === 'high' ? y - 8 : y + 16
          ctx.fillText(s.label, centerX, labelY)
          // Dot
          ctx.beginPath()
          ctx.arc(centerX, y, 2, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      if (params.showBOS || params.showCHOCH) {
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        for (const ev of events) {
          if (ev.kind === 'BOS' && !params.showBOS) continue
          if (ev.kind === 'CHOCH' && !params.showCHOCH) continue
          if (ev.index < range.start || ev.index >= range.end) continue
          if (ev.brokenSwingIndex < range.start) continue
          const x1 = kLineCenters[ev.brokenSwingIndex - range.start]
          const x2 = kLineCenters[ev.index - range.start]
          if (x1 === undefined || x2 === undefined) continue
          const y = toY(ev.brokenLevel)
          ctx.strokeStyle = ev.kind === 'BOS' ? colors.structure.bos : colors.structure.choch
          ctx.beginPath()
          ctx.moveTo(x1, y)
          ctx.lineTo(x2, y)
          ctx.stroke()
          ctx.fillStyle = ev.kind === 'BOS' ? colors.structure.bos : colors.structure.choch
          ctx.fillText(ev.kind, (x1 + x2) / 2, y - 4)
        }
        ctx.setLineDash([])
      }

      ctx.restore()
    },
    getConfig() {
      if (!instanceId) return {}
      const state = pluginHost
        ?.getService<IndicatorRenderStateReader>(INDICATOR_INSTANCE_STATE_SERVICE)
        ?.get<StructureRenderState>(instanceId)
      return state?.params ?? {}
    },
    setConfig() {},
  }
}

function getStructureTitleInfo(
  _data: KLineData[],
  index: number | null,
  params: Record<string, number | boolean | string>,
  stateReader: IndicatorRenderStateReader,
  instanceId: string,
  _paneId: string,
  colors: ColorTokens,
): TitleInfo | null {
  if (index === null) return null
  const leftWindow = (params.leftWindow as number) ?? 5
  const rightWindow = (params.rightWindow as number) ?? 2
  const state = stateReader.get<StructureRenderState>(instanceId)

  const values: Array<{ label: string; value: number; color: string }> = []
  if (state && state.series.swings.length > 0) {
    values.push({ label: 'Swings', value: state.series.swings.length, color: colors.structure.hh })
    values.push({
      label: 'Events',
      value: state.series.events.length,
      color: colors.structure.choch,
    })
  }

  return {
    name: 'Structure',
    params: [leftWindow, rightWindow],
    values,
  }
}

@Indicator({
  name: 'structure',
  displayName: 'Structure',
  kind: IndicatorKind.Indicator,
  category: 'main',
  indicatorType: 'structure',
  defaultPaneId: 'sub_Structure',
  allowMainPane: true,
  mainPane: {
    rendererName: 'structure_main',
    toActiveConfig: (params, active) => ({
      ...params,
      showSwingLabels: active,
      showBOS: active,
      showCHOCH: active,
    }),
  },
  scale: { indicatorKey: 'structure', label: 'Structure', decimals: 2 },
  getTitleInfo: getStructureTitleInfo,
  visibleState: {
    compose: createFixedUnitVisibleStateComposer('structure', EMPTY_STRUCTURE_STATE),
  },
  presentation: {
    defaultOptions: {
      showSwingLabels: true,
      showBOS: true,
      showCHOCH: true,
      showProvisional: true,
    },
  },
  runtime: {
    outputAlignment: 'aggregate',
    defaultParams: { leftWindow: 5, rightWindow: 2, breakoutSource: 'close' as const },
    computeKey: 'calcStructureData',
    compute: (data, c) => calcStructureData(data, c.leftWindow, c.rightWindow, c.breakoutSource),
  },
})
export class StructureIndicatorDefinition {
  static rendererFactory = createStructureRendererPlugin
}
