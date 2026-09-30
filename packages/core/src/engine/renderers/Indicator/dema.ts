import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import type { Layer } from '@/rendering/scene/types.js'
import { calcDEMAData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import type { DEMARenderState } from '../../indicators/state/demaState.js'
import { EMPTY_DEMA_STATE } from '../../indicators/state/demaState.js'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'
import { createIndicatorRendererLayer } from './shared/indicatorRendererLayer.js'

import { createSingleLineTitleInfo } from './shared/titleInfo.js'

type Point = { x: number; y: number }

interface DEMARendererOptions {
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

function createDEMALayer(options: DEMARendererOptions = {}): Layer<RenderContext> {
  const { paneId = 'main', instanceId } = options
  return createIndicatorRendererLayer({
    name: `dema_${paneId}`,
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
      const state = context.indicatorStateReader?.get<DEMARenderState>(instanceId)
      if (!state || !state.params.showDEMA || state.visibleMin > state.visibleMax) return

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

      if (tryDrawLinesGpu(context, [{ points, width: 1, color: colors.palette.i9 }], scrollLeft))
        return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.palette.i9
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

const getDEMATitleInfo = createSingleLineTitleInfo({
  name: 'DEMA',
  getParams: (p) => [p.period as number],
  getColor: (colors) => colors.palette.i9,
})

@Indicator({
  name: 'dema',
  displayName: 'DEMA',
  kind: IndicatorKind.Indicator,
  getTitleInfo: getDEMATitleInfo,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 'dema_main',
    toActiveConfig: (params, active) => ({ ...params, showDEMA: active }),
  },
  visibleState: { compose: createSparseVisibleStateComposer('dema', EMPTY_DEMA_STATE) },
  scale: { indicatorKey: 'dema', label: 'DEMA', decimals: 2 },
  presentation: { defaultOptions: { showDEMA: true } },
  runtime: {
    defaultParams: { period: 14 },
    computeKey: 'calcDEMAData',
    compute: (data, c) => calcDEMAData(data, c.period),
  },
})
export class DEMADefinition {
  static rendererFactory = createDEMALayer
}
