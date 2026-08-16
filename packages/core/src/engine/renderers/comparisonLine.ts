import type { RendererPlugin, RenderContext } from '../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../foundation/plugin/index'
import { resolveThemeColors } from '../../foundation/tokens/index'
import type { KLineData } from '../../foundation/types/price'
import { symbolSpecIdentityKey } from '../data/symbolIdentity'

export function createComparisonLineRenderer(): RendererPlugin {
  return {
    name: 'comparisonLine',
    version: '1.0.0',
    description: '比较视图折线渲染器（主商品 + 比较商品百分比折线）',
    debugName: '比较折线',
    paneId: 'main',
    priority: RENDERER_PRIORITY.MAIN + 2,

    draw(context: RenderContext) {
      if (context.dataView !== 'comparison') return
      const mainData = context.data as KLineData[]
      const comparisonSymbols = context.comparisonSymbols ?? []
      if (comparisonSymbols.length === 0 || mainData.length === 0) return
      if (context.pane.id !== 'main') return

      const baseIndex = Math.max(0, context.range.start)
      const baseItem = mainData[baseIndex]
      if (!baseItem || !Number.isFinite(baseItem.close) || baseItem.close <= 0) return
      const mainBase = baseItem.close
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

      // 主商品折线：percent 轴下 priceToY(close) 即主商品自身涨跌幅
      strokeStrip(ctx, buildMainLinePoints(context, mainData), colors.palette.i1)

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
            buildComparisonLinePoints(context, mainData, byDate, baseline.close, mainBase),
            comparisonColors?.get(identity) ?? colors.palette.i2,
          )
        }
      }

      ctx.restore()
    },
  }
}

/** 主商品折线点集：直接以 close 映射 y（percent 轴下即自身涨跌幅） */
export function buildMainLinePoints(
  context: RenderContext,
  mainData: ReadonlyArray<KLineData>,
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = []
  for (let i = context.range.start; i < context.range.end && i < mainData.length; i++) {
    const item = mainData[i]
    const x = context.kLineCenters[i - context.range.start]
    if (!item || x === undefined || !Number.isFinite(item.close)) {
      points.push({ x: x ?? 0, y: Number.NaN })
      continue
    }
    points.push({ x, y: context.pane.yAxis.priceToY(item.close) })
  }
  return points
}

/** 比较商品折线点集：相对自身基准的涨跌幅折算为等价价格后映射 y */
export function buildComparisonLinePoints(
  context: RenderContext,
  mainData: ReadonlyArray<KLineData>,
  byDate: ReadonlyMap<string, KLineData>,
  baselineClose: number,
  mainBase: number,
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = []
  for (let i = context.range.start; i < context.range.end && i < mainData.length; i++) {
    const mainItem = mainData[i]
    const x = context.kLineCenters[i - context.range.start]
    if (!mainItem || x === undefined) {
      points.push({ x: x ?? 0, y: Number.NaN })
      continue
    }
    const key = mainItem.date ?? String(mainItem.timestamp)
    const item = byDate.get(key)
    if (!item || !Number.isFinite(item.close)) {
      points.push({ x, y: Number.NaN })
      continue
    }
    const pct = ((item.close - baselineClose) / baselineClose) * 100
    const equivalentPrice = mainBase * (1 + pct / 100)
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
