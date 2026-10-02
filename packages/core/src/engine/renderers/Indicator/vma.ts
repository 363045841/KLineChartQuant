import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import type { Layer } from '@/rendering/scene/types.js'
import { calcVMAData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import type { VMARenderState } from '../../indicators/state/vmaState.js'
import { EMPTY_VMA_STATE } from '../../indicators/state/vmaState.js'
import { createNonNegativeSparseVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'
import { createIndicatorRendererLayer } from './shared/indicatorRendererLayer.js'

import { createSingleLineTitleInfo } from './shared/titleInfo.js'

type LinePoint = { x: number; y: number }

function createVMALayer(
  options: { paneId?: string; instanceId?: string } = {},
): Layer<RenderContext> {
  const { paneId = 'sub_VMA', instanceId } = options
  return createIndicatorRendererLayer({
    name: `vma_${paneId}`,
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
      const state = context.indicatorStateReader?.get<VMARenderState>(instanceId)
      if (!state || !state.params.showVMA || state.visibleMin > state.visibleMax) return

      const { series } = state
      const displayRange = pane.yAxis.getDisplayRange()
      const displayMin = displayRange.minPrice
      const displayMax = displayRange.maxPrice
      const displayValueRange = displayMax - displayMin || 1

      const paneH = pane.height
      const invRange = paneH / displayValueRange
      const rangeStart = range.start

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

const getVMATitleInfo = createSingleLineTitleInfo({
  name: 'VMA',
  defaultPeriod: 5,
  getColor: (colors) => colors.palette.i6,
})

@Indicator({
  name: 'vma',
  displayName: 'VMA',
  kind: IndicatorKind.Indicator,
  category: 'volume',
  indicatorType: 'volume',
  defaultPaneId: 'sub_VMA',
  scale: { indicatorKey: 'vma', label: 'VMA', decimals: 0 },
  getTitleInfo: getVMATitleInfo,
  visibleState: { compose: createNonNegativeSparseVisibleStateComposer('vma', EMPTY_VMA_STATE) },
  presentation: { defaultOptions: { showVMA: true } },
  runtime: {
    defaultParams: { period: 5 },
    computeKey: 'calcVMAData',
    compute: (data, c) => calcVMAData(data, c.period),
  },
})
export class VMAIndicatorDefinition {
  static rendererFactory = createVMALayer
}
