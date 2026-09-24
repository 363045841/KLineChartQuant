/**
 * ZLEMA（零滞后指数移动平均）单线渲染器
 * 完整骨架与 wma.ts 一致：优先走 WebGL 线段绘制，失败回退 Canvas2D
 */
import type {
  IndicatorRenderStateReader,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '../../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../../foundation/tokens/index.js'
import { calcZLEMAData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { ZLEMARenderState } from '../../indicators/state/zlemaState.js'
import { EMPTY_ZLEMA_STATE } from '../../indicators/state/zlemaState.js'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'

import { createSingleLineTitleInfo } from './shared/titleInfo.js'

type Point = { x: number; y: number }

interface ZLEMARendererOptions {
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

/** 创建 ZLEMA 渲染器插件，draw 时按状态中 showZLEMA 决定是否绘制 */
function createZLEMARendererPlugin(options: ZLEMARendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'main', instanceId } = options
  let pluginHost: PluginHost | null = null

  return {
    name: `zlema_${paneId}`,
    version: '1.1.0',
    description: 'ZLEMA 零滞后指数移动均线渲染器（WebGL + Canvas2D 回退）',
    debugName: 'ZLEMA',
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
      const state = context.indicatorStateReader?.get<ZLEMARenderState>(instanceId)
      if (!state || !state.params.showZLEMA || state.visibleMin > state.visibleMax) return

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

      if (tryDrawLinesGpu(context, [{ points, width: 1, color: colors.palette.i6 }], scrollLeft))
        return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.palette.i6
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
        ?.get<ZLEMARenderState>(instanceId)
      return state?.params ?? {}
    },

    setConfig() {
      // no-op
    },
  }
}

const getZLEMATitleInfo = createSingleLineTitleInfo({
  name: 'ZLEMA',
  getParams: (p) => [p.period as number],
  getColor: (colors) => colors.palette.i6,
})

@Indicator({
  name: 'zlema',
  displayName: 'ZLEMA',
  kind: IndicatorKind.Indicator,
  getTitleInfo: getZLEMATitleInfo,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 'zlema_main',
    toActiveConfig: (params, active) => ({ ...params, showZLEMA: active }),
  },
  visibleState: { compose: createSparseVisibleStateComposer('zlema', EMPTY_ZLEMA_STATE) },
  scale: { indicatorKey: 'zlema', label: 'ZLEMA', decimals: 2 },
  presentation: { defaultOptions: { showZLEMA: true } },
  runtime: {
    defaultParams: { period: 14 },
    computeKey: 'calcZLEMAData',
    compute: (data, c) => calcZLEMAData(data, c.period),
  },
})
export class ZLEMADefinition {
  static rendererFactory = createZLEMARendererPlugin
}
