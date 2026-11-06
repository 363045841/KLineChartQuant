/** OHLC 世界几何：保留横向中心的小数，尺寸与纵向边界按物理像素构建。 */
import { calcBarLeftPx, fitBarWidthPx } from '../../../viewport/klineConfig.js'
import type { OhlcGeometry, OhlcGeometryInput, OhlcRect } from '../types.js'

const THICK_WICK_ZOOM_LEVEL = 10

/** 物理像素矩形转换为批次消费的逻辑像素。 */
function ohlcRect(dpr: number, x: number, y: number, width: number, height: number): OhlcRect {
  return [x / dpr, y / dpr, width / dpr, height / dpr]
}

/** 高低线使用完整实体宽度覆盖 high/low 区间，开收盘价不影响几何。 */
function projectHighLow(input: OhlcGeometryInput): OhlcGeometry {
  const dpr = input.dpr
  const width = fitBarWidthPx(input.widthPx, input.zoomLevel >= THICK_WICK_ZOOM_LEVEL ? 2 : 1)
  const left = calcBarLeftPx(input.center * dpr, width)
  const high = Math.round(input.highY * dpr)
  const low = Math.round(input.lowY * dpr)
  return {
    body: [ohlcRect(dpr, left, Math.min(high, low), width, Math.max(1, Math.abs(low - high)))],
    border: [],
    wick: [],
  }
}

/** 美国线：竖线覆盖高低区间，左右刻度表示开收盘价。 */
function projectOhlcBar(
  input: OhlcGeometryInput,
  left: number,
  stemLeft: number,
  stroke: number,
): OhlcGeometry {
  const dpr = input.dpr
  const high = Math.round(input.highY * dpr)
  const low = Math.round(input.lowY * dpr)
  const open = Math.round(input.openY * dpr)
  const close = Math.round(input.closeY * dpr)
  const tickWidth = Math.max(0, stemLeft - left)
  const body = [
    ohlcRect(dpr, stemLeft, Math.min(high, low), stroke, Math.max(1, Math.abs(low - high))),
  ]
  if (tickWidth > 0) {
    body.push(ohlcRect(dpr, left, open, tickWidth, stroke))
    body.push(ohlcRect(dpr, stemLeft + stroke, close, tickWidth, stroke))
  }
  return { body, border: [], wick: [] }
}

/** 构建空心/分离边框；宽度不足时退化为实心矩形。 */
function buildCandleBorder(
  dpr: number,
  left: number,
  top: number,
  width: number,
  height: number,
  hollow: boolean,
  body: OhlcRect[],
  border: OhlcRect[],
): void {
  if (width <= 2 || height <= 2) {
    border.push(ohlcRect(dpr, left, top, width, height))
    return
  }
  border.push(
    ohlcRect(dpr, left, top, width, 1),
    ohlcRect(dpr, left, height + top - 1, width, 1),
    ohlcRect(dpr, left, top + 1, 1, height - 2),
    ohlcRect(dpr, left + width - 1, top + 1, 1, height - 2),
  )
  if (!hollow) body.push(ohlcRect(dpr, left + 1, top + 1, width - 2, height - 2))
}

/** 上下影线只在区间有高度时追加。 */
function buildWicks(
  dpr: number,
  stemLeft: number,
  stroke: number,
  high: number,
  top: number,
  bottom: number,
  low: number,
): OhlcRect[] {
  const wick: OhlcRect[] = []
  if (top > high) wick.push(ohlcRect(dpr, stemLeft, high, stroke, top - high))
  if (low > bottom) wick.push(ohlcRect(dpr, stemLeft, bottom, stroke, low - bottom))
  return wick
}

/** 蜡烛实体、边框与影线；等宽同色时合并为连续三段。 */
function projectCandle(
  input: OhlcGeometryInput,
  left: number,
  stemLeft: number,
  width: number,
  stroke: number,
): OhlcGeometry {
  const dpr = input.dpr
  const open = Math.round(input.openY * dpr)
  const close = Math.round(input.closeY * dpr)
  const high = Math.round(input.highY * dpr)
  const low = Math.round(input.lowY * dpr)
  const top = Math.min(open, close)
  const height = Math.max(1, Math.abs(open - close))
  const bottom = top + height
  // 等宽且同色时三段覆盖连续；保留十字星实体可能超出 low 的一个物理像素。
  if (input.mergeWick && !input.separateBorder && width === stroke) {
    const lineTop = Math.min(high, top)
    return {
      body: [ohlcRect(dpr, stemLeft, lineTop, stroke, Math.max(bottom, low) - lineTop)],
      border: [],
      wick: [],
    }
  }
  const body: OhlcRect[] = []
  const border: OhlcRect[] = []
  const hollow = input.shape === 'hollow-candlestick'
  if (hollow || input.separateBorder) {
    buildCandleBorder(dpr, left, top, width, height, hollow, body, border)
  } else {
    body.push(ohlcRect(dpr, left, top, width, height))
  }
  return { body, border, wick: buildWicks(dpr, stemLeft, stroke, high, top, bottom, low) }
}

/** 投影单根蜡烛、美国线或高低线；零高度区间保留一个物理像素。 */
export function projectOhlc(input: OhlcGeometryInput): OhlcGeometry {
  if (input.shape === 'high-low') return projectHighLow(input)
  const dpr = input.dpr
  const stroke = input.zoomLevel >= THICK_WICK_ZOOM_LEVEL ? 2 : 1
  const width = fitBarWidthPx(input.widthPx, stroke)
  // 实体与影线共用连续中心，最终扣除滚动量后由矩形批次统一对齐。
  const center = input.center * dpr
  const left = calcBarLeftPx(center, width)
  const stemLeft = calcBarLeftPx(center, stroke)
  if (input.shape === 'ohlc-bar') return projectOhlcBar(input, left, stemLeft, stroke)
  return projectCandle(input, left, stemLeft, width, stroke)
}
