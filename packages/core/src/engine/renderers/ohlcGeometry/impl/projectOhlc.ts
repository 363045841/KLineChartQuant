/** OHLC 世界几何：保留横向中心的小数，尺寸与纵向边界按物理像素构建。 */
import { calcBarLeftPx, fitBarWidthPx } from '../../../viewport/klineConfig.js'
import type { OhlcGeometry, OhlcGeometryInput, OhlcRect } from '../types.js'

const THICK_WICK_ZOOM_LEVEL = 10

/** 投影单根蜡烛、美国线或高低线；零高度区间保留一个物理像素。 */
export function projectOhlc(input: OhlcGeometryInput): OhlcGeometry {
  const { dpr } = input
  const open = Math.round(input.openY * dpr)
  const close = Math.round(input.closeY * dpr)
  const high = Math.round(input.highY * dpr)
  const low = Math.round(input.lowY * dpr)
  const stroke = input.zoomLevel >= THICK_WICK_ZOOM_LEVEL ? 2 : 1
  const width = fitBarWidthPx(input.widthPx, stroke)
  // 实体与影线共用连续中心，最终扣除滚动量后由矩形批次统一对齐。
  const center = input.center * dpr
  const left = calcBarLeftPx(center, width)
  const stemLeft = calcBarLeftPx(center, stroke)
  /** 物理像素矩形转换为批次消费的逻辑像素。 */
  const rect = (x: number, y: number, w: number, h: number): OhlcRect => [
    x / dpr,
    y / dpr,
    w / dpr,
    h / dpr,
  ]
  // 高低线使用完整实体宽度覆盖 high/low 区间，开收盘价不影响几何。
  if (input.shape === 'high-low') {
    return {
      body: [rect(left, Math.min(high, low), width, Math.max(1, Math.abs(low - high)))],
      border: [],
      wick: [],
    }
  }
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
  // 等宽且同色时三段覆盖连续；保留十字星实体可能超出 low 的一个物理像素。
  if (input.mergeWick && !input.separateBorder && width === stroke) {
    const lineTop = Math.min(high, top)
    return {
      body: [rect(stemLeft, lineTop, stroke, Math.max(bottom, low) - lineTop)],
      border: [],
      wick: [],
    }
  }
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
