import type { IndicatorRenderStateReader, RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import type { ColorTokens } from '@/foundation/tokens/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import type { KLineData } from '@/foundation/types/price.js'
import { alignToPhysicalPixelCenter } from '@/foundation/utils/pixelAlign.js'
import type { Layer } from '@/rendering/scene/types.js'
import { ChartDataViewId } from '../../chartModel/index.js'
import type { MACDPoint } from '../../indicators/calculators/index.js'
import { calcMACDData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import type { MACDRenderState } from '../../indicators/state/macdState.js'
import { EMPTY_MACD_STATE } from '../../indicators/state/macdState.js'
import { createMACDVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { barVerticalRect } from '../barGeometry/impl/projectBars.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'
import { drawWorldRectBatches } from '../rectsViaRenderer.js'
import { createMacdScaleLayer } from './scale/macd_scale.js'
import { createIndicatorRendererLayer } from './shared/indicatorRendererLayer.js'

type LinePoint = { x: number; y: number }

interface MACDConfig {
  /** 快线周期（默认 12） */
  fastPeriod?: number
  /** 慢线周期（默认 26） */
  slowPeriod?: number
  /** DEA 周期（默认 9） */
  signalPeriod?: number
  /** 是否显示 DIF 线 */
  showDIF?: boolean
  /** 是否显示 DEA 线 */
  showDEA?: boolean
  /** 是否显示 MACD 柱 */
  showBAR?: boolean
}

interface MACDRendererOptions {
  /** 目标 pane ID（默认 'sub'） */
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
  /** 初始配置 */
  config?: MACDConfig
}

/**
 * 创建 MACD 渲染器插件
 * 从指标实例投影读取 MACD 状态，不再内联计算
 */
function createMACDLayer(options: MACDRendererOptions = {}): Layer<RenderContext> {
  const { paneId = 'sub', instanceId, config: initialConfig = {} } = options
  const config: Required<MACDConfig> = {
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    showDIF: true,
    showDEA: true,
    showBAR: true,
    ...initialConfig,
  }

  // 线条点缓存（用于 WebGL/Canvas2D 渲染）
  let cachedLineKey = ''
  let cachedDifPoints: LinePoint[] = []
  let cachedDeaPoints: LinePoint[] = []

  // 构建线条缓存 key
  function buildLineCacheKey(
    range: { start: number; end: number },
    kLineCenters: number[],
    pane: RenderContext['pane'],
    displayMin: number,
    displayMax: number,
    stateTimestamp: number,
  ): string {
    return [
      stateTimestamp,
      range.start,
      range.end,
      kLineCenters.length,
      kLineCenters[0]?.toFixed(2) ?? 'n',
      kLineCenters[kLineCenters.length - 1]?.toFixed(2) ?? 'n',
      displayMax.toFixed(6),
      displayMin.toFixed(6),
      pane.yAxis.getPriceOffset().toFixed(6),
      pane.yAxis.getScaleType(),
      pane.height.toFixed(2),
      config.showDIF,
      config.showDEA,
    ].join('|')
  }

  return createIndicatorRendererLayer({
    definitionId: 'macd',
    paneId,
    z: RENDERER_PRIORITY.INDICATOR,
    draw(context) {
      const { ctx, pane, data, range, scrollLeft, dpr, kLineCenters } = context
      const klineData = data as KLineData[]
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )

      if (!instanceId) return
      const state = context.indicatorStateReader?.get<MACDRenderState>(instanceId)
      if (!state || state.visibleMin > state.visibleMax) return
      if (klineData.length < config.slowPeriod) return

      const macdData = state.series
      if (!macdData || macdData.length === 0) return

      // 图形与刻度共用 Pane 范围，包含手动平移和缩放。
      const displayRange = pane.yAxis.getDisplayRange()
      const displayMin = displayRange.minPrice
      const displayMax = displayRange.maxPrice
      const displayValueRange = displayMax - displayMin || 1

      // 零轴位置
      const zeroY = pane.height - ((0 - displayMin) / displayValueRange) * pane.height

      const drawStart = Math.max(range.start, config.slowPeriod - 1)
      const drawEnd = Math.min(range.end, klineData.length)

      // 绘制 MACD 柱状图（WebGL 优先）
      if (config.showBAR) {
        const maxBars = Math.max(1, drawEnd - drawStart)
        const batches = [
          colors.macd.barUp,
          colors.macd.barUpLight,
          colors.macd.barDownLight,
          colors.macd.barDown,
        ].map((color) => ({ color, buf: new Float64Array(maxBars * 4), count: 0 }))

        for (let i = drawStart; i < drawEnd; i++) {
          const point = macdData[i]
          if (!point) continue

          const barRect = context.kBarRects[i - range.start]
          if (!barRect || barRect.width <= 0) continue

          const barY = pane.height - ((point.macd - displayMin) / displayValueRange) * pane.height
          const isPositive = point.macd >= 0

          const prevPoint = i > 0 ? macdData[i - 1] : null
          const isRising = prevPoint ? point.macd >= prevPoint.macd : true

          const vertical = barVerticalRect(barY, zeroY, dpr)
          const batch = batches[(isPositive ? 0 : 2) + (isRising ? 0 : 1)]!
          const off = batch.count++ * 4
          batch.buf[off] = barRect.x
          batch.buf[off + 1] = vertical.y
          batch.buf[off + 2] = barRect.width
          batch.buf[off + 3] = vertical.height
        }

        drawWorldRectBatches(context, batches)
      }

      // 更新线条点缓存
      const lineCacheKey = buildLineCacheKey(
        range,
        kLineCenters,
        pane,
        displayMin,
        displayMax,
        state.timestamp,
      )
      if (cachedLineKey !== lineCacheKey) {
        cachedLineKey = lineCacheKey
        cachedDifPoints = []
        cachedDeaPoints = []

        if (config.showDIF) {
          for (let i = drawStart; i < drawEnd; i++) {
            const point = macdData[i]
            if (!point) continue
            const centerX = kLineCenters[i - range.start]
            if (centerX === undefined) continue
            const logicY =
              pane.height - ((point.dif - displayMin) / displayValueRange) * pane.height
            cachedDifPoints.push({ x: centerX, y: logicY })
          }
        }

        if (config.showDEA) {
          for (let i = drawStart; i < drawEnd; i++) {
            const point = macdData[i]
            if (!point) continue
            const centerX = kLineCenters[i - range.start]
            if (centerX === undefined) continue
            const logicY =
              pane.height - ((point.dea - displayMin) / displayValueRange) * pane.height
            cachedDeaPoints.push({ x: centerX, y: logicY })
          }
        }
      }

      // 绘制 DIF/DEA 线（sceneRenderer → Canvas2D）
      {
        const lines: Array<{ points: LinePoint[]; width: number; color: string }> = []
        if (config.showDIF && cachedDifPoints.length >= 2) {
          lines.push({ points: cachedDifPoints, width: 1, color: colors.macd.dif })
        }
        if (config.showDEA && cachedDeaPoints.length >= 2) {
          lines.push({ points: cachedDeaPoints, width: 1, color: colors.macd.dea })
        }
        if (!tryDrawLinesGpu(context, lines, scrollLeft)) {
          drawMacdLinesWithCanvas2D(
            ctx,
            scrollLeft,
            colors.macd.dif,
            colors.macd.dea,
            cachedDifPoints,
            cachedDeaPoints,
            config,
          )
        }
      }
    },
  })
}

function drawMacdLinesWithCanvas2D(
  ctx: CanvasRenderingContext2D,
  scrollLeft: number,
  difColor: string,
  deaColor: string,
  difPoints: LinePoint[],
  deaPoints: LinePoint[],
  config: { showDIF: boolean; showDEA: boolean },
): void {
  ctx.save()
  ctx.translate(-scrollLeft, 0)
  ctx.lineWidth = 1
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  if (config.showDIF && difPoints.length >= 2) {
    ctx.strokeStyle = difColor
    ctx.beginPath()
    ctx.moveTo(difPoints[0]!.x, difPoints[0]!.y)
    for (let i = 1; i < difPoints.length; i++) {
      const point = difPoints[i]!
      ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
  }

  if (config.showDEA && deaPoints.length >= 2) {
    ctx.strokeStyle = deaColor
    ctx.beginPath()
    ctx.moveTo(deaPoints[0]!.x, deaPoints[0]!.y)
    for (let i = 1; i < deaPoints.length; i++) {
      const point = deaPoints[i]!
      ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
  }

  ctx.restore()
}

/**
 * 获取 MACD 标题信息（供 paneTitle 使用）
 * 从 pluginHost 获取已计算好的数据，避免重复计算
 */
function getMACDTitleInfo(
  _data: KLineData[],
  index: number | null,
  params: Record<string, number | boolean | string>,
  stateReader: IndicatorRenderStateReader,
  instanceId: string,
  _paneId: string,
  colors: ColorTokens,
): {
  name: string
  params: number[]
  values: Array<{ label: string; value: number; color: string }>
} | null {
  if (index === null) return null
  const fastPeriod = (params.fastPeriod as number) ?? 12
  const slowPeriod = (params.slowPeriod as number) ?? 26
  const signalPeriod = (params.signalPeriod as number) ?? 9
  const state = stateReader.get<MACDRenderState>(instanceId)
  if (!state) return null

  const point = state.series[index]
  if (!point) return null

  return {
    name: 'MACD',
    params: [fastPeriod, slowPeriod, signalPeriod],
    values: [
      { label: 'DIF', value: point.dif, color: colors.macd.dif },
      { label: 'DEA', value: point.dea, color: colors.macd.dea },
      {
        label: 'MACD',
        value: point.macd,
        color: point.macd >= 0 ? colors.macd.barUp : colors.macd.barDown,
      },
    ],
  }
}

@Indicator({
  name: 'macd',
  displayName: 'MACD',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  indicatorType: 'momentum',
  defaultPaneId: 'sub_MACD',
  dataViews: [ChartDataViewId.KLine, ChartDataViewId.TimeShare, ChartDataViewId.FiveDayTimeShare],
  scaleRendererFactory: createMacdScaleLayer,
  visibleState: { compose: createMACDVisibleStateComposer('macd', EMPTY_MACD_STATE) },
  getTitleInfo: getMACDTitleInfo,
  presentation: { defaultOptions: { showDIF: true, showDEA: true, showBAR: true } },
  runtime: {
    defaultParams: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
    computeKey: 'calcMACDData',
    compute: (data, c) => calcMACDData(data, c.fastPeriod, c.slowPeriod, c.signalPeriod),
  },
})
export class MACDIndicatorDefinition {
  static rendererFactory = createMACDLayer
}
