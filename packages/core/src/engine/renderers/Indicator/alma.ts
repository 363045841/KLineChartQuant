/**
 * ALMA（Arnaud Legoux 移动平均）主图单线渲染器
 * 复用 WMA 渲染器骨架，多参数（period/offset/sigma），支持 WebGL + Canvas2D 回退
 */
import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import type { Layer } from '@/rendering/scene/types.js'
import { calcALMAData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDecorator.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import type { ALMARenderState } from '../../indicators/state/almaState.js'
import { EMPTY_ALMA_STATE } from '../../indicators/state/almaState.js'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'
import { createIndicatorRendererLayer } from './shared/indicatorRendererLayer.js'

import { createSingleLineTitleInfo } from './shared/titleInfo.js'

type Point = { x: number; y: number }

interface ALMARendererOptions {
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

function createALMALayer(options: ALMARendererOptions = {}): Layer<RenderContext> {
  const { paneId = 'main', instanceId } = options
  return createIndicatorRendererLayer({
    definitionId: 'alma',
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
      const state = context.indicatorStateReader?.get<ALMARenderState>(instanceId)
      if (!state || !state.params.showALMA || state.visibleMin > state.visibleMax) return

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

const getALMATitleInfo = createSingleLineTitleInfo({
  name: 'ALMA',
  getParams: (p) => [p.period as number, p.offset as number, p.sigma as number],
  getColor: (colors) => colors.palette.i3,
})

@Indicator({
  name: 'alma',
  displayName: 'ALMA',
  kind: IndicatorKind.Indicator,
  getTitleInfo: getALMATitleInfo,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    toActiveConfig: (params, active) => ({ ...params, showALMA: active }),
  },
  visibleState: { compose: createSparseVisibleStateComposer('alma', EMPTY_ALMA_STATE) },
  scale: { indicatorKey: 'alma', label: 'ALMA', decimals: 2 },
  presentation: { defaultOptions: { showALMA: true } },
  runtime: {
    defaultParams: { period: 9, offset: 0.85, sigma: 6 },
    computeKey: 'calcALMAData',
    compute: (data, c) => calcALMAData(data, c.period, c.offset, c.sigma),
  },
})
export class ALMADefinition {
  static rendererFactory = createALMALayer
}
