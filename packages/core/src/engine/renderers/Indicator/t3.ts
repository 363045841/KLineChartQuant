/**
 * T3 主图单线渲染器
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
import { calcT3Data } from '../../indicators/calculators/t3.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { T3RenderState } from '../../indicators/state/t3State.js'
import { EMPTY_T3_STATE } from '../../indicators/state/t3State.js'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'

import { createSingleLineTitleInfo } from './shared/titleInfo.js'

type Point = { x: number; y: number }

interface T3RendererOptions {
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

/** 创建 T3 主图单线渲染插件。 */
function createT3RendererPlugin(options: T3RendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'main', instanceId } = options
  let pluginHost: PluginHost | null = null

  return {
    name: `t3_${paneId}`,
    version: '1.1.0',
    description: 'T3 Tillson 平滑移动均线渲染器（WebGL + Canvas2D 回退）',
    debugName: 'T3',
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

    // 将可见 T3 序列转换为屏幕折线并优先提交给 GPU。
    draw(context: RenderContext) {
      const { ctx, pane, range, scrollLeft, kLineCenters } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )

      if (!instanceId) return
      const state = context.indicatorStateReader?.get<T3RenderState>(instanceId)
      if (!state || !state.params.showT3 || state.visibleMin > state.visibleMax) return

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

      if (tryDrawLinesGpu(context, [{ points, width: 1, color: colors.palette.i3 }], scrollLeft))
        return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.palette.i3
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
        ?.get<T3RenderState>(instanceId)
      return state?.params ?? {}
    },

    // 指标配置由调度器统一更新，渲染器不直接写状态。
    setConfig() {
      // no-op
    },
  }
}

const getT3TitleInfo = createSingleLineTitleInfo({
  name: 'T3',
  getParams: (p) => [p.period as number, p.volumeFactor as number],
  getColor: (colors) => colors.palette.i3,
})

@Indicator({
  name: 't3',
  displayName: 't3',
  kind: IndicatorKind.Indicator,
  getTitleInfo: getT3TitleInfo,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 't3_main',
    toActiveConfig: (params, active) => ({ ...params, showT3: active }),
  },
  visibleState: { compose: createSparseVisibleStateComposer('t3', EMPTY_T3_STATE) },
  scale: { indicatorKey: 't3', label: 'T3', decimals: 2 },
  presentation: { defaultOptions: { showT3: true } },
  runtime: {
    defaultParams: { period: 5, volumeFactor: 0.7 },
    computeKey: 'calcT3Data',
    compute: (data: KLineData[], c) => calcT3Data(data, c.period, c.volumeFactor),
  },
})
export class T3Definition {
  static rendererFactory = createT3RendererPlugin
}
