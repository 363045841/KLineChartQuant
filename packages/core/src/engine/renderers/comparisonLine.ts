// 比较视图折线渲染器：把对比集合每个品种相对自身基准的涨跌幅折算到参考序列基准价后绘制。
import type { RendererPlugin, RenderContext } from '../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../foundation/plugin/index'
import { resolveThemeColors } from '../../foundation/tokens/index'
import type { KLineData } from '../../foundation/types/price'
import { ChartDataViewId } from '../../foundation/types/chartView'
import { symbolSpecIdentityKey } from '../data/symbolIdentity'
import { resolveComparisonBaseIndex } from '../utils/comparisonBaseline'

export function createComparisonLineRenderer(): RendererPlugin {
  return {
    name: 'comparisonLine',
    version: '1.0.0',
    description: '比较视图折线渲染器（对比集合百分比折线）',
    debugName: '比较折线',
    paneId: 'main',
    priority: RENDERER_PRIORITY.MAIN + 2,

    draw(context: RenderContext) {
      if (context.dataView !== ChartDataViewId.Comparison) return
      // context.data 是对比集合首个序列，仅作为横轴与百分比基准的参考序列，不单独绘制。
      const referenceData = context.data as KLineData[]
      const comparisonSymbols = context.comparisonSymbols ?? []
      if (comparisonSymbols.length === 0 || referenceData.length === 0) return
      if (context.pane.id !== 'main') return

      const baseIndex = resolveComparisonBaseIndex(
        context.range,
        context.kLineCenters,
        context.scrollLeft,
      )
      const baseItem = referenceData[baseIndex]
      if (!baseItem || !Number.isFinite(baseItem.close) || baseItem.close <= 0) return
      const basePrice = baseItem.close
      const baseDate = baseItem.date ?? ''

      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )

      const ctx = context.ctx
      ctx.save()
      ctx.translate(-context.scrollLeft, 0)
      ctx.lineWidth = Math.max(1, 1.5 / context.dpr)

      const comparisonData = context.comparisonData
      if (comparisonData?.size) {
        const comparisonColors = context.comparisonColors
        for (let symbolIndex = 0; symbolIndex < comparisonSymbols.length; symbolIndex++) {
          const spec = comparisonSymbols[symbolIndex]!
          const identity = symbolSpecIdentityKey(spec)
          const data = comparisonData.get(identity)
          if (!data?.length) continue

          const baseline = baseDate
            ? findBaselineByDate(data, baseDate)
            : findBaselineByTimestamp(data, baseItem.timestamp)
          if (!baseline || baseline.close <= 0) continue

          const byDate = new Map<string, KLineData>()
          for (const item of data) {
            byDate.set(item.date ?? String(item.timestamp), item)
          }

          strokeStrip(
            ctx,
            buildComparisonLinePoints(
              context,
              referenceData,
              byDate,
              baseline.close,
              basePrice,
              baseIndex,
            ),
            comparisonColors?.get(identity) ?? colors.palette.i2,
          )
        }
      }

      ctx.restore()
    },
  }
}

/** 比较商品折线点集：相对自身基准的涨跌幅折算为参考序列基准上的等价价格后映射 y */
export function buildComparisonLinePoints(
  context: RenderContext,
  referenceData: ReadonlyArray<KLineData>,
  byDate: ReadonlyMap<string, KLineData>,
  baselineClose: number,
  basePrice: number,
  baseIndex: number,
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = []
  const start = Math.max(baseIndex, context.range.start)
  for (let i = start; i < context.range.end && i < referenceData.length; i++) {
    const referenceItem = referenceData[i]
    const x = context.kLineCenters[i - context.range.start]
    if (!referenceItem || x === undefined) {
      points.push({ x: x ?? 0, y: Number.NaN })
      continue
    }
    const key = referenceItem.date ?? String(referenceItem.timestamp)
    const item = byDate.get(key)
    if (!item || !Number.isFinite(item.close)) {
      points.push({ x, y: Number.NaN })
      continue
    }
    const pct = ((item.close - baselineClose) / baselineClose) * 100
    const equivalentPrice = basePrice * (1 + pct / 100)
    const y = context.pane.yAxis.priceToY(equivalentPrice)
    points.push({ x, y })
  }
  return points
}

/** 以 moveTo/lineTo 绘制一条折线，遇非法点断开路径 */
export function strokeStrip(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<{ x: number; y: number }>,
  color: string,
): void {
  if (points.length < 2) return
  ctx.beginPath()
  ctx.strokeStyle = color
  let hasPath = false
  for (const p of points) {
    if (!Number.isFinite(p.y)) {
      hasPath = false
      continue
    }
    if (hasPath) ctx.lineTo(p.x, p.y)
    else ctx.moveTo(p.x, p.y)
    hasPath = true
  }
  if (hasPath) ctx.stroke()
}

function findBaselineByDate(data: ReadonlyArray<KLineData>, date: string): KLineData | null {
  for (const item of data) {
    if (item.date && item.date >= date) return item
  }
  return null
}

function findBaselineByTimestamp(
  data: ReadonlyArray<KLineData>,
  timestamp: number,
): KLineData | null {
  for (const item of data) {
    if (item.timestamp >= timestamp) return item
  }
  return null
}
