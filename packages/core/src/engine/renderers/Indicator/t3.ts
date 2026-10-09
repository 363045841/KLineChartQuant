/**
 * T3 主图单线渲染器
 * 使用 GPU 折线渲染并在不可用时回退到 Canvas2D。
 */
import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import type { KLineData } from '@/foundation/types/price.js'
import type { Layer } from '@/rendering/scene/types.js'
import { calcT3Data } from '../../indicators/calculators/t3.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import type { T3RenderState } from '../../indicators/state/t3State.js'
import { EMPTY_T3_STATE } from '../../indicators/state/t3State.js'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'
import { createIndicatorRendererLayer } from './shared/indicatorRendererLayer.js'

import { createSingleLineTitleInfo } from './shared/titleInfo.js'

type Point = { x: number; y: number }

interface T3RendererOptions {
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

/** 创建 T3 主图单线渲染插件。 */
function createT3Layer(options: T3RendererOptions = {}): Layer<RenderContext> {
  const { paneId = 'main', instanceId } = options
  return createIndicatorRendererLayer({
    definitionId: 't3',
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
  })
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
  static rendererFactory = createT3Layer
}
