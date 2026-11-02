/**
 * 分时绘制公共实现：昨收线、分段面积填充、分段折线与完整的单日/五日绘制入口。
 *
 * 单日与五日只在几何来源上不同，绘制路径必须完全一致。
 */
import type { RenderContext } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { isTimeShareDataArray } from '@/foundation/types/price.js'
import { resolveTimeShareBaseline } from '../chartModel/index.js'

/** 绘制昨收虚线，横跨给定交易日区间。 */
export function drawPreCloseLine(
  ctx: CanvasRenderingContext2D,
  startX: number,
  endX: number,
  y: number,
  dpr: number,
  color: string,
): void {
  if (endX <= startX) return

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(startX, y)
  ctx.lineTo(endX, y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

/**
 * 渐变向背景收敛时的终点色：主题背景色的 RGB 加 0 透明度。
 *
 * Canvas 渐变插值颜色通道，终点若写成透明黑，整块面积会向灰色偏移；
 * 用背景色作基色让渐变只在 alpha 上收敛，面积才真正融进画布。
 */
function resolveBackgroundFade(ctx: CanvasRenderingContext2D, background: string): string {
  ctx.save()
  // fillStyle 的 getter 返回浏览器规范化后的颜色（#rrggbb 或 rgba(...)），不需要自行解析主题写法。
  ctx.fillStyle = background
  const normalized = ctx.fillStyle
  ctx.restore()
  if (normalized.startsWith('#')) return `${normalized.slice(0, 7)}00`
  const [r, g, b] = normalized.slice(normalized.indexOf('(') + 1).split(',')
  return `rgba(${r?.trim()}, ${g?.trim()}, ${b?.trim()}, 0)`
}

/** 按片段基准线分别绘制上涨和下跌面积，渐变由片段基准色收敛到主题背景色。 */
export function drawAreaFill(
  ctx: CanvasRenderingContext2D,
  xPositions: number[],
  yPrices: number[],
  baselineY: number,
  dpr: number,
  upColor: string,
  downColor: string,
  background: string,
): void {
  if (xPositions.length < 2) return

  const n = xPositions.length
  const fade = resolveBackgroundFade(ctx, background)

  function buildPolygon(isAbove: boolean): Array<{ x: number; y: number }> {
    const pts: Array<{ x: number; y: number }> = [{ x: xPositions[0]!, y: baselineY }]
    const firstOnOurSide = isAbove ? yPrices[0]! <= baselineY : yPrices[0]! >= baselineY
    if (firstOnOurSide) {
      pts.push({ x: xPositions[0]!, y: yPrices[0]! })
    }

    for (let i = 0; i < n - 1; i++) {
      const x1 = xPositions[i]!,
        y1 = yPrices[i]!
      const x2 = xPositions[i + 1]!,
        y2 = yPrices[i + 1]!

      const y1OnOurSide = isAbove ? y1 <= baselineY : y1 >= baselineY
      const y2OnOurSide = isAbove ? y2 <= baselineY : y2 >= baselineY

      if (y1OnOurSide !== y2OnOurSide) {
        const t = (baselineY - y1) / (y2 - y1)
        const cx = x1 + t * (x2 - x1)
        pts.push({ x: cx, y: baselineY })
      }
      if (y2OnOurSide) {
        pts.push({ x: x2, y: y2 })
      }
    }

    pts.push({ x: xPositions[n - 1]!, y: baselineY })
    return pts
  }

  const abovePts = buildPolygon(true)
  if (abovePts.length >= 3) {
    const topY = Math.min(...abovePts.map((p) => p.y))
    ctx.save()
    const grad = ctx.createLinearGradient(0, topY, 0, baselineY)
    grad.addColorStop(0, upColor)
    grad.addColorStop(1, fade)
    ctx.beginPath()
    ctx.moveTo(abovePts[0]!.x, abovePts[0]!.y)
    for (let i = 1; i < abovePts.length; i++) {
      ctx.lineTo(abovePts[i]!.x, abovePts[i]!.y)
    }
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()
    ctx.restore()
  }

  const belowPts = buildPolygon(false)
  if (belowPts.length >= 3) {
    const botY = Math.max(...belowPts.map((p) => p.y))
    ctx.save()
    const grad = ctx.createLinearGradient(0, baselineY, 0, botY)
    grad.addColorStop(0, fade)
    grad.addColorStop(1, downColor)
    ctx.beginPath()
    ctx.moveTo(belowPts[0]!.x, belowPts[0]!.y)
    for (let i = 1; i < belowPts.length; i++) {
      ctx.lineTo(belowPts[i]!.x, belowPts[i]!.y)
    }
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()
    ctx.restore()
  }
}

/**
 * 绘制一帧分时主序列：单日与五日共用同一份帧级几何。
 *
 * 段由几何层按槽位连续性切好；这里只画段，不判断交易日或槽位边界。
 * 昨收缺失时仍绘制价格与均价线，只跳过基准虚线和面积填充。
 */
export function paintTimeShareFrame(context: RenderContext): void {
  const geometry = context.timeShareGeometry
  if (!geometry || geometry.days.length === 0 || !isTimeShareDataArray(context.data)) return

  const data = context.data
  if (data.length === 0) return

  const colors = resolveThemeColors(
    context.theme,
    context.isAsiaMarket,
    context.colorPresetSettings,
  )
  const baseline = resolveTimeShareBaseline(context.timeShareBaseline)
  const { ctx, pane, dpr, range, kLineCenters, scrollLeft } = context
  const baselineY = baseline === null ? null : pane.yAxis.priceToY(baseline)

  ctx.save()
  ctx.translate(-scrollLeft, 0)

  if (baselineY !== null) {
    for (const day of geometry.days) {
      drawPreCloseLine(ctx, day.startX, day.endX, baselineY, dpr, colors.timeSharePreClose)
    }
  }

  for (const segment of geometry.segments) {
    const start = Math.max(segment.dataStartIndex, range.start)
    const end = Math.min(segment.dataEndIndex, range.end, data.length)
    if (end - start < 2) continue
    const xPositions: number[] = []
    const yPrices: number[] = []
    const yAvgs: number[] = []
    for (let index = start; index < end; index++) {
      const point = data[index]
      const x = kLineCenters[index - range.start]
      if (!point || x === undefined) continue
      xPositions.push(x)
      yPrices.push(pane.yAxis.priceToY(point.price))
      yAvgs.push(pane.yAxis.priceToY(point.average))
    }
    if (xPositions.length < 2) continue

    if (baselineY !== null) {
      drawAreaFill(
        ctx,
        xPositions,
        yPrices,
        baselineY,
        dpr,
        colors.timeShareAreaUp,
        colors.timeShareAreaDown,
        colors.chartBackground,
      )
    }
    drawSegmentLine(ctx, xPositions, yPrices, dpr, colors.timeSharePriceLine, 1)
    drawSegmentLine(ctx, xPositions, yAvgs, dpr, colors.timeShareAvgLine, 1)
  }

  ctx.restore()
}

/** 绘制单个交易日内连续的分时折线。 */
export function drawSegmentLine(
  ctx: CanvasRenderingContext2D,
  xPositions: number[],
  yPositions: number[],
  _dpr: number,
  color: string,
  lineWidth: number,
): void {
  if (xPositions.length < 2) return

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  ctx.beginPath()
  ctx.moveTo(xPositions[0]!, yPositions[0]!)

  for (let i = 1; i < xPositions.length; i++) {
    ctx.lineTo(xPositions[i]!, yPositions[i]!)
  }

  ctx.stroke()
  ctx.restore()
}
