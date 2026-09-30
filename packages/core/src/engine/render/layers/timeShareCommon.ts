/**
 * 分时绘制公共原语：昨收线、分段面积填充、分段折线。
 *
 * 从旧 `renderers/timeShare.ts` 抽出，供单日与五日分时 Layer 共用。
 */
import type { RenderContext } from '@/foundation/plugin/index.js'

/** 绘制一个分时片段的昨收虚线。 */
export function drawPreCloseLine(
  ctx: CanvasRenderingContext2D,
  xPositions: number[],
  y: number,
  dpr: number,
  color: string,
): void {
  if (xPositions.length < 2) return
  const firstX = xPositions[0]!
  const lastX = xPositions[xPositions.length - 1]!

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(firstX, y)
  ctx.lineTo(lastX, y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

/** 按片段基准线分别绘制上涨和下跌面积。 */
export function drawAreaFill(
  ctx: CanvasRenderingContext2D,
  xPositions: number[],
  yPrices: number[],
  baselineY: number,
  dpr: number,
  upColor: string,
  downColor: string,
): void {
  if (xPositions.length < 2) return

  const n = xPositions.length

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
    grad.addColorStop(1, 'rgba(0,0,0,0)')
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
    grad.addColorStop(0, 'rgba(0,0,0,0)')
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
