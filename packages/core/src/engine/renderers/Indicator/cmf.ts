import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import type { Layer } from '@/rendering/scene/types.js'
import { calcCMFData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import type { CMFRenderState } from '../../indicators/state/cmfState.js'
import { EMPTY_CMF_STATE } from '../../indicators/state/cmfState.js'
import { createFixedRangeSparseVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'
import { createIndicatorRendererLayer } from './shared/indicatorRendererLayer.js'

import { createSingleLineTitleInfo } from './shared/titleInfo.js'

type LinePoint = { x: number; y: number }

function createCMFLayer(
  options: {
    paneId?: string
    /** 指标实例 ID，渲染状态寻址唯一键。 */
    instanceId?: string
  } = {},
): Layer<RenderContext> {
  const { paneId = 'sub_CMF', instanceId } = options
  return createIndicatorRendererLayer({
    name: `cmf_${paneId}`,
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
      const state = context.indicatorStateReader?.get<CMFRenderState>(instanceId)
      if (!state || !state.params.showCMF || state.visibleMin > state.visibleMax) return

      const { series } = state
      const displayRange = pane.yAxis.getDisplayRange()
      const displayMin = displayRange.minPrice
      const displayMax = displayRange.maxPrice
      const displayValueRange = displayMax - displayMin || 1
      const paneH = pane.height
      const invRange = paneH / displayValueRange
      const rangeStart = range.start

      // Zero line
      const zeroY = paneH - (0 - displayMin) * invRange
      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.referenceLine.neutral
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(scrollLeft, zeroY)
      ctx.lineTo(scrollLeft + context.paneWidth, zeroY)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()

      const drawEnd = Math.min(range.end, series.length)
      const points: LinePoint[] = []
      for (let i = range.start; i < drawEnd; i++) {
        const value = series[i]
        if (value === undefined) continue
        const centerX = kLineCenters[i - rangeStart]
        if (centerX === undefined) continue
        points.push({ x: centerX, y: paneH - (value - displayMin) * invRange })
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
  })
}

const getCMFTitleInfo = createSingleLineTitleInfo({
  name: 'CMF',
  defaultPeriod: 20,
  getColor: (colors) => colors.palette.i6,
})

@Indicator({
  name: 'cmf',
  displayName: 'CMF',
  kind: IndicatorKind.Indicator,
  category: 'volume',
  indicatorType: 'volume',
  defaultPaneId: 'sub_CMF',
  visibleState: { compose: createFixedRangeSparseVisibleStateComposer('cmf', EMPTY_CMF_STATE) },
  scale: { indicatorKey: 'cmf', label: 'CMF', decimals: 4 },
  getTitleInfo: getCMFTitleInfo,
  presentation: { defaultOptions: { showCMF: true } },
  runtime: {
    defaultParams: { period: 20 },
    computeKey: 'calcCMFData',
    compute: (data, c) => calcCMFData(data, c.period),
  },
})
export class CMFIndicatorDefinition {
  static rendererFactory = createCMFLayer
}
