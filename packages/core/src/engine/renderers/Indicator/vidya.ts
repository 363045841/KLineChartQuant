/**
 * VIDYA 主图单线渲染器
 * 使用 GPU 折线渲染并在不可用时回退到 Canvas2D。
 */
import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import type { KLineData } from '@/foundation/types/price.js'
import type { Layer } from '@/rendering/scene/types.js'
import { calcVIDYAData } from '../../indicators/calculators/vidya.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import type { VIDYARenderState } from '../../indicators/state/vidyaState.js'
import { EMPTY_VIDYA_STATE } from '../../indicators/state/vidyaState.js'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'
import { createIndicatorRendererLayer } from './shared/indicatorRendererLayer.js'

import { createSingleLineTitleInfo } from './shared/titleInfo.js'

type Point = { x: number; y: number }

interface VIDYARendererOptions {
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

/** 创建 VIDYA 主图单线渲染插件。 */
function createVIDYALayer(options: VIDYARendererOptions = {}): Layer<RenderContext> {
  const { paneId = 'main', instanceId } = options
  return createIndicatorRendererLayer({
    name: `vidya_${paneId}`,
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
      const state = context.indicatorStateReader?.get<VIDYARenderState>(instanceId)
      if (!state || !state.params.showVIDYA || state.visibleMin > state.visibleMax) return

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

      if (tryDrawLinesGpu(context, [{ points, width: 1, color: colors.palette.i4 }], scrollLeft))
        return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.palette.i4
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
  })
}

const getVIDYATitleInfo = createSingleLineTitleInfo({
  name: 'VIDYA',
  getParams: (p) => [p.period as number, p.cmoPeriod as number],
  getColor: (colors) => colors.palette.i4,
})

@Indicator({
  name: 'vidya',
  displayName: 'vidya',
  kind: IndicatorKind.Indicator,
  getTitleInfo: getVIDYATitleInfo,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 'vidya_main',
    toActiveConfig: (params, active) => ({ ...params, showVIDYA: active }),
  },
  visibleState: { compose: createSparseVisibleStateComposer('vidya', EMPTY_VIDYA_STATE) },
  scale: { indicatorKey: 'vidya', label: 'VIDYA', decimals: 2 },
  presentation: { defaultOptions: { showVIDYA: true } },
  runtime: {
    defaultParams: { period: 14, cmoPeriod: 9 },
    computeKey: 'calcVIDYAData',
    compute: (data: KLineData[], c) => calcVIDYAData(data, c.period, c.cmoPeriod),
  },
})
export class VIDYADefinition {
  static rendererFactory = createVIDYALayer
}
