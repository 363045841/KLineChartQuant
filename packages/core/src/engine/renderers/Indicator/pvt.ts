import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import type { Layer } from '@/rendering/scene/types.js'
import { calcPVTData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import type { PVTRenderState } from '../../indicators/state/pvtState.js'
import { EMPTY_PVT_STATE } from '../../indicators/state/pvtState.js'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'
import { createIndicatorRendererLayer } from './shared/indicatorRendererLayer.js'

import { createSingleLineTitleInfo } from './shared/titleInfo.js'

type LinePoint = { x: number; y: number }

function createPVTLayer(
  options: { paneId?: string; instanceId?: string } = {},
): Layer<RenderContext> {
  const { paneId = 'sub_PVT', instanceId } = options
  return createIndicatorRendererLayer({
    name: `pvt_${paneId}`,
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
      const state = context.indicatorStateReader?.get<PVTRenderState>(instanceId)
      if (!state || !state.params.showPVT || state.visibleMin > state.visibleMax) return

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
  })
}

const getPVTTitleInfo = createSingleLineTitleInfo({
  name: 'PVT',
  getColor: (colors) => colors.palette.i8,
})

@Indicator({
  name: 'pvt',
  displayName: 'PVT',
  kind: IndicatorKind.Indicator,
  category: 'volume',
  indicatorType: 'volume',
  defaultPaneId: 'sub_PVT',
  visibleState: { compose: createSparseVisibleStateComposer('pvt', EMPTY_PVT_STATE) },
  scale: { indicatorKey: 'pvt', label: 'PVT', decimals: 0 },
  getTitleInfo: getPVTTitleInfo,
  presentation: { defaultOptions: { showPVT: true } },
  runtime: {
    defaultParams: {},
    computeKey: 'calcPVTData',
    compute: (data, c) => calcPVTData(data),
  },
})
export class PVTIndicatorDefinition {
  static rendererFactory = createPVTLayer
}
