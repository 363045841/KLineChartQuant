import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import type { Layer } from '@/rendering/scene/types.js'
import { calcCCIData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDecorator.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import type { CCIRenderState } from '../../indicators/state/cciState.js'
import { EMPTY_CCI_STATE } from '../../indicators/state/cciState.js'
import { createCCIVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'
import { createCciScaleLayer } from './scale/cci_scale.js'
import { createIndicatorRendererLayer } from './shared/indicatorRendererLayer.js'
import { createSingleLineTitleInfo } from './shared/titleInfo.js'

type LinePoint = { x: number; y: number }

interface CCIRendererOptions {
  /** 目标 pane ID（默认 'sub'） */
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

/**
 * 创建 CCI 渲染器插件
 */
function createCCILayer(options: CCIRendererOptions = {}): Layer<RenderContext> {
  const { paneId = 'sub', instanceId } = options
  // 线条点缓存
  let cachedKey = ''
  let cachedCCIPoints: LinePoint[] = []

  function clearLineCache() {
    cachedKey = ''
    cachedCCIPoints = []
  }

  function buildCCICacheKey(
    range: { start: number; end: number },
    kLineCenters: number[],
    pane: RenderContext['pane'],
    params: CCIRenderState['params'],
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
      params.showCCI,
      params.period,
    ].join('|')
  }

  return createIndicatorRendererLayer({
    definitionId: 'cci',
    paneId,
    z: RENDERER_PRIORITY.INDICATOR,
    draw(context) {
      const { ctx, pane, range, scrollLeft, dpr, kLineCenters } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )

      if (!instanceId) return
      const state = context.indicatorStateReader?.get<CCIRenderState>(instanceId)
      if (!state || state.visibleMin > state.visibleMax) {
        clearLineCache()
        return
      }

      const { params, series } = state

      const displayRange = pane.yAxis.getDisplayRange()
      const displayMin = displayRange.minPrice
      const displayMax = displayRange.maxPrice
      const displayValueRange = displayMax - displayMin || 1

      // 零轴位置
      const zeroY = pane.height - ((0 - displayMin) / displayValueRange) * pane.height

      ctx.save()
      ctx.translate(-scrollLeft, 0)

      // 绘制超买超卖线 +100/-100（虚线保持 Canvas 2D）
      const y100 = pane.height - ((100 - displayMin) / displayValueRange) * pane.height
      const yNeg100 = pane.height - ((-100 - displayMin) / displayValueRange) * pane.height

      const lineStartX = scrollLeft
      const lineEndX = scrollLeft + context.paneWidth

      ctx.strokeStyle = colors.cci.overbought
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(lineStartX, y100)
      ctx.lineTo(lineEndX, y100)
      ctx.stroke()

      ctx.strokeStyle = colors.cci.oversold
      ctx.beginPath()
      ctx.moveTo(lineStartX, yNeg100)
      ctx.lineTo(lineEndX, yNeg100)
      ctx.stroke()

      // 零轴使用通用参考线 token。
      ctx.strokeStyle = colors.referenceLine.neutral
      ctx.beginPath()
      ctx.moveTo(lineStartX, zeroY)
      ctx.lineTo(lineEndX, zeroY)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.restore()

      // 确定绘制范围
      const drawStart = Math.max(range.start, params.period - 1)
      const drawEnd = Math.min(range.end, series.length)

      // 更新线条缓存
      const cacheKey = buildCCICacheKey(range, kLineCenters, pane, params, state.timestamp)
      if (cachedKey !== cacheKey) {
        cachedKey = cacheKey
        cachedCCIPoints = []

        if (params.showCCI) {
          for (let i = drawStart; i < drawEnd; i++) {
            const value = series[i]
            if (value === undefined) continue

            const centerX = kLineCenters[i - range.start]
            if (centerX === undefined) continue

            const logicY = pane.height - ((value - displayMin) / displayValueRange) * pane.height
            cachedCCIPoints.push({ x: centerX, y: logicY })
          }
        }
      }

      // 绘制 CCI 线（WebGL 优先，Canvas2D 回退）
      const cciLines =
        params.showCCI && cachedCCIPoints.length >= 2
          ? [{ points: cachedCCIPoints, width: 1, color: colors.cci.cci }]
          : []
      if (!tryDrawLinesGpu(context, cciLines, scrollLeft)) {
        drawCCILineWithCanvas2D(ctx, scrollLeft, cachedCCIPoints, params, colors)
      }
    },
  })
}

/**
 * 使用 Canvas 2D 绘制 CCI 线（WebGL 回退）
 */
function drawCCILineWithCanvas2D(
  ctx: CanvasRenderingContext2D,
  scrollLeft: number,
  cciPoints: LinePoint[],
  params: { showCCI: boolean },
  colors: { cci: { cci: string; overbought: string; oversold: string } },
): void {
  if (!params.showCCI || cciPoints.length < 2) return

  ctx.save()
  ctx.translate(-scrollLeft, 0)
  ctx.strokeStyle = colors.cci.cci
  ctx.lineWidth = 1
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cciPoints[0]!.x, cciPoints[0]!.y)
  for (let i = 1; i < cciPoints.length; i++) {
    const point = cciPoints[i]!
    ctx.lineTo(point.x, point.y)
  }
  ctx.stroke()
  ctx.restore()
}

/**
 * 获取 CCI 标题信息（供 paneTitle 使用）
 */
const getCCITitleInfo = createSingleLineTitleInfo({
  name: 'CCI',
  defaultPeriod: 14,
  getColor: (colors) => colors.cci.cci,
})

@Indicator({
  name: 'cci',
  displayName: 'CCI',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  indicatorType: 'momentum',
  defaultPaneId: 'sub_CCI',
  scaleRendererFactory: createCciScaleLayer,
  visibleState: { compose: createCCIVisibleStateComposer('cci', EMPTY_CCI_STATE) },
  getTitleInfo: getCCITitleInfo,
  presentation: { defaultOptions: { showCCI: true } },
  runtime: {
    defaultParams: { period: 14 },
    computeKey: 'calcCCIData',
    compute: (data, c) => calcCCIData(data, c.period),
  },
})
export class CCIIndicatorDefinition {
  static rendererFactory = createCCILayer
}
