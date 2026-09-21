import type {
  IndicatorRenderStateReader,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '../../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../../foundation/tokens/index.js'
import { calcDMAData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import type { GetTitleInfoFn } from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { DMARenderState } from '../../indicators/state/dmaState.js'
import { EMPTY_DMA_STATE } from '../../indicators/state/dmaState.js'
import { createValuePointVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'

type LinePoint = { x: number; y: number }

interface DMARendererOptions {
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

function createDMARendererPlugin(options: DMARendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'main', instanceId } = options
  let pluginHost: PluginHost | null = null

  return {
    name: `dma_${paneId}`,
    version: '1.0.0',
    description: 'DMA 平行线差渲染器（WebGL + Canvas2D 回退）',
    debugName: 'DMA',
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
      const state = context.indicatorStateReader?.get<DMARenderState>(instanceId)
      if (!state || !state.params.showDMA || state.visibleMin > state.visibleMax) return

      // 从稀疏点数组逐点收集 DIF/AMA 折线
      // DMA 是独立副图：用自身极值（含 padding）映射 y，而不是主图价格轴
      const { series } = state
      const drawEnd = Math.min(range.end, series.length)
      const rangeStart = range.start

      let valueMin = state.visibleMin
      let valueMax = state.visibleMax
      const padding = Math.max(0.05, (valueMax - valueMin) * 0.1)
      valueMin = valueMin - padding
      valueMax = valueMax + padding
      const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
      const displayMin = displayRange.minPrice
      const displayMax = displayRange.maxPrice
      const displayValueRange = displayMax - displayMin || 1
      const valueToY = (value: number) =>
        pane.height - ((value - displayMin) / displayValueRange) * pane.height

      const difPoints: LinePoint[] = []
      const amaPoints: LinePoint[] = []
      for (let i = range.start; i < drawEnd; i++) {
        const p = series[i]
        if (!p) continue
        const centerX = kLineCenters[i - rangeStart]
        if (centerX === undefined) continue
        difPoints.push({ x: centerX, y: valueToY(p.dif) })
        amaPoints.push({ x: centerX, y: valueToY(p.ama) })
      }

      const lines: Array<{ points: LinePoint[]; width: number; color: string }> = []
      if (difPoints.length >= 2)
        lines.push({ points: difPoints, width: 1, color: colors.palette.i9 })
      if (amaPoints.length >= 2)
        lines.push({ points: amaPoints, width: 1, color: colors.palette.i2 })
      if (lines.length === 0) return

      // GPU 批量画两条折线，失败回退 Canvas2D
      if (tryDrawLinesGpu(context, lines, scrollLeft)) return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.lineWidth = 1
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'

      for (const line of lines) {
        ctx.strokeStyle = line.color
        ctx.beginPath()
        ctx.moveTo(line.points[0]!.x, line.points[0]!.y)
        for (let i = 1; i < line.points.length; i++) {
          const point = line.points[i]!
          ctx.lineTo(point.x, point.y)
        }
        ctx.stroke()
      }

      ctx.restore()
    },

    getConfig() {
      if (!instanceId) return {}
      const state = pluginHost
        ?.getService<IndicatorRenderStateReader>(INDICATOR_INSTANCE_STATE_SERVICE)
        ?.get<DMARenderState>(instanceId)
      return state?.params ?? {}
    },

    setConfig() {
      // no-op
    },
  }
}

const getDMATitleInfo: GetTitleInfoFn = (
  _data,
  index,
  _params,
  stateReader,
  instanceId,
  _paneId,
  colors,
) => {
  if (index === null) return null
  const state = stateReader.get<DMARenderState>(instanceId)
  if (!state) return null
  const p = state.series[index]
  if (!p) return null
  return {
    name: 'DMA',
    params: [state.params.p1, state.params.p2, state.params.p3],
    values: [
      { label: 'DIF', value: p.dif, color: colors.palette.i9 },
      { label: 'AMA', value: p.ama, color: colors.palette.i2 },
    ],
  }
}

@Indicator({
  name: 'dma',
  displayName: 'DMA',
  getTitleInfo: getDMATitleInfo,
  category: 'oscillator',
  indicatorType: 'trend',
  defaultPaneId: 'sub_DMA',
  visibleState: {
    compose: createValuePointVisibleStateComposer('dma', EMPTY_DMA_STATE, ['dif', 'ama']),
  },
  scale: { indicatorKey: 'dma', label: 'DMA', decimals: 2 },
  presentation: { defaultOptions: { showDMA: true } },
  runtime: {
    defaultParams: { p1: 10, p2: 50, p3: 10 },
    computeKey: 'calcDMAData',
    compute: (data, c) => calcDMAData(data, c.p1, c.p2, c.p3),
  },
})
export class DMADefinition {
  static rendererFactory = createDMARendererPlugin
}
