/** OHLC 共享几何：先在整数物理像素空间构建，再交给矩形批次渲染。 */
import { calcBarLeftPx, fitBarWidthPx } from '../../../viewport/klineConfig.js'
import type { OhlcGeometry, OhlcGeometryInput, OhlcRect } from '../types.js'

const THICK_WICK_ZOOM_LEVEL = 10

/** 投影单根蜡烛或美国线；零高度实体保留一个物理像素。 */
export function projectOhlc(input: OhlcGeometryInput): OhlcGeometry {
  const { dpr } = input
  const open = Math.round(input.openY * dpr)
  const close = Math.round(input.closeY * dpr)
  const high = Math.round(input.highY * dpr)
  const low = Math.round(input.lowY * dpr)
  const stroke = input.zoomLevel >= THICK_WICK_ZOOM_LEVEL ? 2 : 1
  const width = fitBarWidthPx(input.widthPx, stroke)
  const center = Math.round(input.center * dpr)
  const left = calcBarLeftPx(center, width)
  const stemLeft = calcBarLeftPx(center, stroke)
  /** 物理像素矩形转换为批次消费的逻辑像素。 */
  const rect = (x: number, y: number, w: number, h: number): OhlcRect => [
    x / dpr,
    y / dpr,
    w / dpr,
    h / dpr,
  ]
  if (input.shape === 'ohlc-bar') {
    const tickWidth = Math.max(0, stemLeft - left)
    const body = [rect(stemLeft, Math.min(high, low), stroke, Math.max(1, Math.abs(low - high)))]
    if (tickWidth > 0) {
      body.push(rect(left, open, tickWidth, stroke))
      body.push(rect(stemLeft + stroke, close, tickWidth, stroke))
    }
    return { body, border: [], wick: [] }
  }
  const top = Math.min(open, close)
  const height = Math.max(1, Math.abs(open - close))
  const bottom = top + height
  const body: OhlcRect[] = []
  const border: OhlcRect[] = []
  const hollow = input.shape === 'hollow-candlestick'
  if (hollow || input.separateBorder) {
    if (width > 2 && height > 2) {
      border.push(
        rect(left, top, width, 1),
        rect(left, bottom - 1, width, 1),
        rect(left, top + 1, 1, height - 2),
        rect(left + width - 1, top + 1, 1, height - 2),
      )
      if (!hollow) body.push(rect(left + 1, top + 1, width - 2, height - 2))
    } else {
      border.push(rect(left, top, width, height))
    }
  } else {
    body.push(rect(left, top, width, height))
  }
  const wick: OhlcRect[] = []
  for (const [start, end] of [
    [high, top],
    [bottom, low],
  ]) {
    if (start !== undefined && end !== undefined && end > start)
      wick.push(rect(stemLeft, start, stroke, end - start))
  }
  return { body, border, wick }
}
