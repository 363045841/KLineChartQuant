/**
 * FRAMA 主图单线渲染器
 * 使用 GPU 折线渲染并在不可用时回退到 Canvas2D。
 */
import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import type { KLineData } from '@/foundation/types/price.js'
import type { Layer } from '@/rendering/scene/types.js'
import { calcFRAMAData } from '../../indicators/calculators/frama.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import type { FRAMARenderState } from '../../indicators/state/framaState.js'
import { EMPTY_FRAMA_STATE } from '../../indicators/state/framaState.js'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'
import { createIndicatorRendererLayer } from './shared/indicatorRendererLayer.js'

import { createSingleLineTitleInfo } from './shared/titleInfo.js'

type Point = { x: number; y: number }

interface FRAMARendererOptions {
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

/** 创建 FRAMA 主图单线渲染插件。 */
function createFRAMALayer(options: FRAMARendererOptions = {}): Layer<RenderContext> {
  const { paneId = 'main', instanceId } = options
  return createIndicatorRendererLayer({
    name: `frama_${paneId}`,
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
  })
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
  static rendererFactory = createFRAMALayer
}
