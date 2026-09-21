/**
 * SMMA（Wilder 平滑移动平均）单线渲染器，WebGL 优先，Canvas2D 回退
 */

import type {
  IndicatorRenderStateReader,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '../../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../../foundation/tokens/index.js'
import { calcSMMAData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { SMMARenderState } from '../../indicators/state/smmaState.js'
import { EMPTY_SMMA_STATE } from '../../indicators/state/smmaState.js'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'

import { createSingleLineTitleInfo } from './shared/titleInfo.js'

type Point = { x: number; y: number }

interface SMMARendererOptions {
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

/**
 * 创建 SMMA 单线渲染器插件
 * @param options 渲染器选项
 * @returns 渲染器插件
 */
function createSMMARendererPlugin(options: SMMARendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'main', instanceId } = options
  let pluginHost: PluginHost | null = null

  return {
    name: `smma_${paneId}`,
    version: '1.1.0',
    description: 'SMMA Wilder 平滑移动均线渲染器（WebGL + Canvas2D 回退）',
    debugName: 'SMMA',
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
      const state = context.indicatorStateReader?.get<SMMARenderState>(instanceId)
      if (!state || !state.params.showSMMA || state.visibleMin > state.visibleMax) return

      const { series } = state
      const drawEnd = Math.min(range.end, series.length)
      const rangeStart = range.start

      // 将可见范围内的有效值映射为折线顶点
      const points: Point[] = []
      for (let i = range.start; i < drawEnd; i++) {
        const value = series[i]
        if (value === undefined) continue
        const centerX = kLineCenters[i - rangeStart]
        if (centerX === undefined) continue
        points.push({ x: centerX, y: pane.yAxis.priceToY(value) })
      }

      if (points.length < 2) return

      // 优先走 GPU 批量折线，不可用时回退 Canvas2D
      if (tryDrawLinesGpu(context, [{ points, width: 1, color: colors.palette.i8 }], scrollLeft))
        return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.palette.i8
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

    getConfig() {
      if (!instanceId) return {}
      const state = pluginHost
        ?.getService<IndicatorRenderStateReader>(INDICATOR_INSTANCE_STATE_SERVICE)
        ?.get<SMMARenderState>(instanceId)
      return state?.params ?? {}
    },

    setConfig() {
      // no-op
    },
  }
}

const getSMMATitleInfo = createSingleLineTitleInfo({
  name: 'SMMA',
  getParams: (p) => [p.period as number],
  getColor: (colors) => colors.palette.i8,
})

@Indicator({
  name: 'smma',
  displayName: 'SMMA',
  getTitleInfo: getSMMATitleInfo,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 'smma_main',
    toActiveConfig: (params, active) => ({ ...params, showSMMA: active }),
  },
  visibleState: { compose: createSparseVisibleStateComposer('smma', EMPTY_SMMA_STATE) },
  scale: { indicatorKey: 'smma', label: 'SMMA', decimals: 2 },
  presentation: { defaultOptions: { showSMMA: true } },
  runtime: {
    defaultParams: { period: 14 },
    computeKey: 'calcSMMAData',
    compute: (data, c) => calcSMMAData(data, c.period),
  },
})
export class SMMADefinition {
  static rendererFactory = createSMMARendererPlugin
}
