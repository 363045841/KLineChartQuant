import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import type { Layer } from '@/rendering/scene/types.js'
import { calcATRData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDecorator.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import type { ATRRenderState } from '../../indicators/state/atrState.js'
import { EMPTY_ATR_STATE } from '../../indicators/state/atrState.js'
import { createNonNegativeSparseVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'
import { createAtrScaleLayer } from './scale/atr_scale.js'
import { createIndicatorRendererLayer } from './shared/indicatorRendererLayer.js'
import { createSingleLineTitleInfo } from './shared/titleInfo.js'

type LinePoint = { x: number; y: number }

interface ATRRendererOptions {
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

function createATRLayer(options: ATRRendererOptions = {}): Layer<RenderContext> {
  const { paneId = 'sub_ATR', instanceId } = options
  let cachedKey = ''
  let cachedPoints: LinePoint[] = []

  function clearCache() {
    cachedKey = ''
    cachedPoints = []
  }

  function buildCacheKey(
    range: { start: number; end: number },
    kLineCenters: number[],
    pane: RenderContext['pane'],
    params: ATRRenderState['params'],
    stateTimestamp: number,
  ): string {
    const dr = pane.yAxis.getDisplayRange()
    return [
      stateTimestamp,
      range.start,
      range.end,
      kLineCenters.length,
      kLineCenters[0]?.toFixed(2) ?? 'n',
      kLineCenters[kLineCenters.length - 1]?.toFixed(2) ?? 'n',
      dr.maxPrice.toFixed(6),
      dr.minPrice.toFixed(6),
      pane.yAxis.getPriceOffset().toFixed(6),
      pane.yAxis.getScaleType(),
      pane.height.toFixed(2),
      params.showATR,
      params.period,
    ].join('|')
  }

  return createIndicatorRendererLayer({
    definitionId: 'atr',
    paneId,
    z: RENDERER_PRIORITY.INDICATOR,
    draw(context) {
      const { ctx, pane, range, scrollLeft, kLineCenters } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const atrColor = colors.palette.indicatorAtr

      if (!instanceId) return
      const state = context.indicatorStateReader?.get<ATRRenderState>(instanceId)
      if (!state || !state.params.showATR || state.visibleMin > state.visibleMax) {
        clearCache()
        return
      }

      const { params, series } = state

      const displayRange = pane.yAxis.getDisplayRange()
      const displayMin = displayRange.minPrice
      const displayMax = displayRange.maxPrice
      const displayValueRange = displayMax - displayMin || 1

      // 基线（ATR 最低永远 ≥ 0，画 0 线作为参考）
      const zeroY = pane.height - ((0 - displayMin) / displayValueRange) * pane.height

      ctx.save()
      ctx.translate(-scrollLeft, 0)

      // 零线使用通用参考线 token。
      ctx.strokeStyle = colors.referenceLine.neutral
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(scrollLeft, zeroY)
      ctx.lineTo(scrollLeft + context.paneWidth, zeroY)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.restore()

      // 绘制范围
      const drawStart = Math.max(range.start, params.period - 1)
      const drawEnd = Math.min(range.end, series.length)

      const cacheKey = buildCacheKey(range, kLineCenters, pane, params, state.timestamp)
      if (cachedKey !== cacheKey) {
        cachedKey = cacheKey
        cachedPoints = []

        for (let i = drawStart; i < drawEnd; i++) {
          const value = series[i]
          if (value === undefined) continue
          const centerX = kLineCenters[i - range.start]
          if (centerX === undefined) continue

          const logicY = pane.height - ((value - displayMin) / displayValueRange) * pane.height
          cachedPoints.push({ x: centerX, y: logicY })
        }
      }

      if (
        !tryDrawLinesGpu(context, [{ points: cachedPoints, width: 1, color: atrColor }], scrollLeft)
      ) {
        drawWithCanvas2D(ctx, scrollLeft, cachedPoints, atrColor)
      }
    },
  })
}

function drawWithCanvas2D(
  ctx: CanvasRenderingContext2D,
  scrollLeft: number,
  points: LinePoint[],
  atrColor: string,
): void {
  if (points.length < 2) return
  ctx.save()
  ctx.translate(-scrollLeft, 0)
  ctx.strokeStyle = atrColor
  ctx.lineWidth = 1
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(points[0]!.x, points[0]!.y)
  for (let i = 1; i < points.length; i++) {
    const point = points[i]!
    ctx.lineTo(point.x, point.y)
  }
  ctx.stroke()
  ctx.restore()
}

const getATRTitleInfo = createSingleLineTitleInfo({
  name: 'ATR',
  defaultPeriod: 14,
  getColor: (colors) => colors.palette.indicatorAtr,
})

@Indicator({
  name: 'atr',
  displayName: 'ATR',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  indicatorType: 'volatility',
  defaultPaneId: 'sub_ATR',
  scaleRendererFactory: createAtrScaleLayer,
  visibleState: { compose: createNonNegativeSparseVisibleStateComposer('atr', EMPTY_ATR_STATE) },
  getTitleInfo: getATRTitleInfo,
  presentation: { defaultOptions: { showATR: true } },
  runtime: {
    defaultParams: { period: 14 },
    computeKey: 'calcATRData',
    compute: (data, c) => calcATRData(data, c.period),
  },
})
export class ATRIndicatorDefinition {
  static rendererFactory = createATRLayer
}
