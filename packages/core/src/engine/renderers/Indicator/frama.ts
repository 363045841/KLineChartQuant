/**
 * FRAMA 主图单线渲染器
 * 使用 GPU 折线渲染并在不可用时回退到 Canvas2D。
 */
import type {
  IndicatorRenderStateReader,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import type { KLineData } from '@/foundation/types/price.js'
import { calcFRAMAData } from '../../indicators/calculators/frama.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { FRAMARenderState } from '../../indicators/state/framaState.js'
import { EMPTY_FRAMA_STATE } from '../../indicators/state/framaState.js'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'

import { createSingleLineTitleInfo } from './shared/titleInfo.js'

type Point = { x: number; y: number }

interface FRAMARendererOptions {
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

/** 创建 FRAMA 主图单线渲染插件。 */
function createFRAMARendererPlugin(options: FRAMARendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'main', instanceId } = options
  let pluginHost: PluginHost | null = null

  return {
    name: `frama_${paneId}`,
    version: '1.1.0',
    description: 'FRAMA 分形自适应移动均线渲染器（WebGL + Canvas2D 回退）',
    debugName: 'FRAMA',
    paneId,
    priority: RENDERER_PRIORITY.INDICATOR,

    // 安装时保存插件宿主，以读取指标共享状态。
    onInstall(host: PluginHost) {
      pluginHost = host
    },

    // 声明本渲染器会读取的共享状态命名空间。
    getDeclaredNamespaces() {
      return instanceId ? [instanceId] : []
    },

    // 将可见 FRAMA 序列转换为屏幕折线并优先提交给 GPU。
    draw(context: RenderContext) {
      const { ctx, pane, range, scrollLeft, kLineCenters } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )

      if (!instanceId) return
      const state = context.indicatorStateReader?.get<FRAMARenderState>(instanceId)
      if (!state || !state.params.showFRAMA || state.visibleMin > state.visibleMax) return

      const { series } = state
      const drawEnd = Math.min(range.end, series.length)
      const rangeStart = range.start

      const points: Point[] = []
      for (let i = range.start; i < drawEnd; i++) {
        const value = series[i]
        if (value === undefined) continue
        const centerX = kLineCenters[i - rangeStart]
        if (centerX === undefined) continue
        points.push({ x: centerX, y: pane.yAxis.priceToY(value) })
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

    // 返回当前指标参数供配置系统读取。
    getConfig() {
      if (!instanceId) return {}
      const state = pluginHost
        ?.getService<IndicatorRenderStateReader>(INDICATOR_INSTANCE_STATE_SERVICE)
        ?.get<FRAMARenderState>(instanceId)
      return state?.params ?? {}
    },

    // 指标配置由调度器统一更新，渲染器不直接写状态。
    setConfig() {
      // no-op
    },
  }
}

const getFRAMATitleInfo = createSingleLineTitleInfo({
  name: 'FRAMA',
  getParams: (p) => [p.period as number],
  getColor: (colors) => colors.palette.i5,
})

@Indicator({
  name: 'frama',
  displayName: 'frama',
  kind: IndicatorKind.Indicator,
  getTitleInfo: getFRAMATitleInfo,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 'frama_main',
    toActiveConfig: (params, active) => ({ ...params, showFRAMA: active }),
  },
  visibleState: { compose: createSparseVisibleStateComposer('frama', EMPTY_FRAMA_STATE) },
  scale: { indicatorKey: 'frama', label: 'FRAMA', decimals: 2 },
  presentation: { defaultOptions: { showFRAMA: true } },
  runtime: {
    defaultParams: { period: 16 },
    computeKey: 'calcFRAMAData',
    compute: (data: KLineData[], c) => calcFRAMAData(data, c.period),
  },
})
export class FRAMADefinition {
  static rendererFactory = createFRAMARendererPlugin
}
