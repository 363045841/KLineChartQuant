/** 足迹主序列 Layer；直接消费内核足迹状态，共享 K 线坐标和覆盖画布。 */
import type {
  FootprintBar,
  FootprintCell,
  FootprintRenderState,
  FootprintTextMode,
} from '@/components/footprint/types.js'
import { FOOTPRINT_TEXT_MODES } from '@/components/footprint/types.js'
import { MAIN_PANE_ID } from '@/engine/pane/types.js'
import { makePluginLayerId } from '@/foundation/plugin/impl/rendererLayerId.js'
import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { getFont } from '@/foundation/tokens/fonts.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { roundToPhysicalPixel, worldXToScreenX } from '@/foundation/utils/pixelAlign.js'
import type { Layer } from '@/rendering/scene/types.js'

/** 不平衡方向的不透明度；透明度不是颜色，故不进入 token。 */
const IMBALANCE_ALPHA = 0.75
/** 普通方向的不透明度。 */
const NORMAL_ALPHA = 0.4
/** 价位数字的最小字号；行距放不下它时整列不画数字。 */
const MIN_LABEL_FONT_SIZE = 8
/** 价位数字的最大字号。 */
const MAX_LABEL_FONT_SIZE = 10
/** 相邻价位标签之间保留的最小垂直间隙（逻辑像素）。 */
const LABEL_GAP = 2
/** 低于该柱宽不显示价位数字，避免文字挤在窄柱上。 */
const MIN_LABEL_COLUMN_WIDTH = 40
/** Delta 汇总文字字号，与指标图例文本（12px）保持一致。 */
const SUMMARY_FONT_SIZE = 12
/** Delta 汇总文字到柱脚最低可见价的垂直间距（逻辑像素）。 */
const SUMMARY_OFFSET = 14

/** 一帧足迹绘制的只读共享输入；各子步骤只读取该快照，不各自解析坐标与配色。 */
interface FootprintFrame {
  /** 覆盖画布 2D 上下文；足迹内容全部绘制在此，不触碰主画布。 */
  readonly ctx: CanvasRenderingContext2D
  /** 价格到屏幕 Y 的映射，取自主图价格轴。 */
  readonly priceToY: (price: number) => number
  /** 主图 pane 的逻辑高度，用于上下裁切与汇总可见性。 */
  readonly paneHeight: number
  /** 设备像素比。 */
  readonly dpr: number
  /** 一个物理像素对应的逻辑长度。 */
  readonly pixel: number
  /** 单个价格档位的价格跨度。 */
  readonly rowSize: number
  /** 全部可见柱两侧共用的数值上限；非正数表示本帧无量可绘。 */
  readonly maxValue: number
  /** 柱宽与柱间距，仅用于估算末列可用宽度。 */
  readonly kWidth: number
  readonly kGap: number
  /** 展示文字模式；整帧一致，决定单值或双列文字内容。 */
  readonly textMode: FootprintTextMode
  /** 是否 Bid Ask 双列模式；决定文字内容与左右对齐。 */
  readonly isBidAsk: boolean
  /** 足迹 Bid/Ask/文字三类 Theme Token 颜色。 */
  readonly bidColor: string
  readonly askColor: string
  readonly textColor: string
}

/** 一列的屏幕几何与统一字号；逐格绘制只读该快照。 */
interface ColumnFrame {
  readonly frame: FootprintFrame
  /** 柱中心在屏幕上的 X。 */
  readonly x: number
  /** 单侧宽度，已对齐物理像素。 */
  readonly halfWidth: number
  /** 整列宽度，供字号判定与汇总宽度复用。 */
  readonly width: number
  /** 整列统一的价位数字字号；0 表示该列不画数字。 */
  readonly labelFontSize: number
}

/** 单格档位矩形；坐标均为对齐后的物理像素。 */
interface CellRect {
  /** 档位上下边界，用于文字垂直居中。 */
  readonly top: number
  readonly bottom: number
  /** 裁切到 pane 后的矩形上边。 */
  readonly rectTop: number
  /** 裁切后的矩形高度；底边为 rectTop + rectHeight。 */
  readonly rectHeight: number
}

/** 一列内已通过视口与文字宽度校验的价位标签。 */
interface ColumnLabel {
  readonly y: number
  readonly fontSize: number
  readonly bid: string
  readonly ask: string
  readonly bidImbalance: boolean
  readonly askImbalance: boolean
}

/** 一列逐格绘制的结果；柱脚位置供 Delta 汇总定位。 */
interface ColumnPaintResult {
  readonly labels: readonly ColumnLabel[]
  /** 最低一根可见矩形的底边；无可见矩形时为 -Infinity。 */
  readonly lowestVisibleY: number
}

/** 确定整列价位数字的统一字号，保证同一列要么全画、要么全不画。
 *
 * 行距取未取整的价格屏幕坐标差；只有最小行距在物理像素取整后仍放得下
 * 「字号 + 间隙」时才返回可用字号，否则返回 0。判定不再依赖逐行取整后的行高，
 * 避免同一列因像素取整抖动而时有时无。
 *
 * @param cells - 该柱按价格升序排列的价位
 * @param priceToY - 价格到屏幕 Y 的映射
 * @param rowSize - 单个价位的价格跨度
 * @param width - 该柱在屏幕上的宽度
 * @param dpr - 设备像素比
 * @returns 统一字号；0 表示该列不显示数字
 */
function resolveLabelFontSize(
  cells: readonly FootprintCell[],
  priceToY: (price: number) => number,
  rowSize: number,
  width: number,
  dpr: number,
): number {
  if (width < MIN_LABEL_COLUMN_WIDTH || cells.length === 0) return 0
  // 只统计相邻价位间距；单档位柱子用自身价格跨度估算。
  let minPitch = Infinity
  if (cells.length === 1) {
    const price = Number(cells[0]!.price)
    minPitch = Math.abs(priceToY(price) - priceToY(price + rowSize))
  } else {
    for (let i = 0; i + 1 < cells.length; i++) {
      const pitch = Math.abs(
        priceToY(Number(cells[i]!.price)) - priceToY(Number(cells[i + 1]!.price)),
      )
      if (pitch > 0) minPitch = Math.min(minPitch, pitch)
    }
  }
  if (!Number.isFinite(minPitch) || minPitch <= 0) return 0
  // 行距取整后可能少一个物理像素，按最坏情况计算，保证相邻标签不重叠。
  const snappedPitch = Math.floor(minPitch * dpr) / dpr
  const fontSize = Math.min(MAX_LABEL_FONT_SIZE, Math.floor(snappedPitch - LABEL_GAP))
  return fontSize >= MIN_LABEL_FONT_SIZE ? fontSize : 0
}

/** 扫描可视区所有柱的 Bid/Ask，返回两侧共用的数值上限。
 *
 * @param bars - 完整足迹柱序列，索引与 K 线对齐；未聚合的档位为空
 * @param start - 可视区起始索引（含）
 * @param end - 可视区结束索引（不含）
 * @returns 两侧共用的数值上限；0 表示无可绘数值
 */
function measureMaxValue(
  bars: FootprintRenderState['series']['bars'],
  start: number,
  end: number,
): number {
  let maxValue = 0
  for (let index = start; index < end; index++) {
    for (const cell of bars[index]?.cells ?? []) {
      maxValue = Math.max(maxValue, Number(cell.bid), Number(cell.ask))
    }
  }
  return maxValue
}

/** 汇总整帧共享的坐标映射、配色与数值上限。
 *
 * @param context - 单帧渲染上下文
 * @param ctx - 已确认非空的覆盖画布上下文
 * @param state - 当前足迹展示状态
 * @param start - 可视区起始索引（含）
 * @param end - 可视区结束索引（不含）
 * @returns 各子步骤只读的帧级快照
 */
function createFootprintFrame(
  context: RenderContext,
  ctx: CanvasRenderingContext2D,
  state: FootprintRenderState,
  start: number,
  end: number,
): FootprintFrame {
  const footprintColors = resolveThemeColors(
    context.theme,
    context.isAsiaMarket,
    context.colorPresetSettings,
  ).footprintCell
  return {
    ctx,
    priceToY: (price) => context.pane.yAxis.priceToY(price),
    paneHeight: context.pane.height,
    dpr: context.dpr,
    pixel: 1 / context.dpr,
    rowSize: Number(state.series.rowSize),
    maxValue: measureMaxValue(state.series.bars, start, end),
    kWidth: context.kWidth,
    kGap: context.kGap,
    textMode: state.textMode,
    isBidAsk: state.textMode === FOOTPRINT_TEXT_MODES.BidAsk,
    bidColor: footprintColors.bid,
    askColor: footprintColors.ask,
    textColor: footprintColors.text,
  }
}

/** 解析一列的柱中心、宽度与统一字号；中心缺失或非有限值时返回 null。
 *
 * @param frame - 帧级共享快照
 * @param bar - 该列足迹数据，提供逐格价位用于字号判定
 * @param kLineCenters - 本帧可见柱中心数组，按可见索引寻址
 * @param visibleIndex - 该列在 kLineCenters 中的下标
 * @param scrollLeft - 视口横向滚动量
 * @returns 列级几何快照；中心无效时返回 null
 */
function resolveColumn(
  frame: FootprintFrame,
  bar: FootprintBar,
  kLineCenters: readonly number[],
  visibleIndex: number,
  scrollLeft: number,
): ColumnFrame | null {
  const center = kLineCenters[visibleIndex]
  if (center === undefined || !Number.isFinite(center)) return null
  const x = worldXToScreenX(center, scrollLeft, frame.dpr)
  // 末列没有右邻居时退到左邻居；首列也没有时按柱宽 + 间距估算。
  const spacing =
    kLineCenters[visibleIndex + 1] !== undefined
      ? kLineCenters[visibleIndex + 1]! - center
      : center - (kLineCenters[visibleIndex - 1] ?? center - frame.kWidth - frame.kGap)
  const halfWidth = Math.max(frame.pixel, roundToPhysicalPixel((spacing - 4) / 2, frame.dpr))
  const width = halfWidth * 2
  // 标签是否显示在列级别一次算定，避免逐行像素取整导致同列时有时无。
  const labelFontSize = resolveLabelFontSize(
    bar.cells,
    frame.priceToY,
    frame.rowSize,
    width,
    frame.dpr,
  )
  return { frame, x, halfWidth, width, labelFontSize }
}

/** 单格档位矩形的像素对齐与视口裁切；返回 null 表示该格不参与绘制。
 *
 * @param frame - 帧级共享快照
 * @param price - 该格的档位下沿价格
 * @returns 裁切后的矩形；完全出视口或坐标非有限时返回 null
 */
function resolveCellRect(frame: FootprintFrame, price: number): CellRect | null {
  const y = frame.priceToY(price)
  const nextY = frame.priceToY(price + frame.rowSize)
  const top = roundToPhysicalPixel(Math.min(y, nextY), frame.dpr)
  const bottom = roundToPhysicalPixel(Math.max(y, nextY), frame.dpr)
  const height = Math.max(frame.pixel, bottom - top)
  if (!Number.isFinite(y) || !Number.isFinite(nextY)) return null
  if (bottom <= 0 || top >= frame.paneHeight) return null
  // 高度表示价格档位，宽度只表示当前口径数值；档位之间留一个物理像素间隔。
  const gap = height >= 3 * frame.pixel ? frame.pixel : 0
  const rectTop = Math.max(0, top)
  const rectBottom = Math.min(roundToPhysicalPixel(frame.paneHeight, frame.dpr), top + height - gap)
  const rectHeight = rectBottom - rectTop
  if (rectHeight <= 0) return null
  return { top, bottom, rectTop, rectHeight }
}

/** 单侧横条长度：按数值比例缩放、对齐物理像素，至少一个像素且不超过半宽。
 *
 * @param frame - 帧级共享快照
 * @param value - 该侧数值，调用方保证为正
 * @param halfWidth - 单侧可用宽度上限
 * @returns 对齐后的横条长度
 */
function resolveBarWidth(frame: FootprintFrame, value: number, halfWidth: number): number {
  return Math.min(
    halfWidth,
    Math.max(frame.pixel, roundToPhysicalPixel((halfWidth * value) / frame.maxValue, frame.dpr)),
  )
}

/** 绘制一格的 Bid/Ask 横条；零值不绘制，不平衡方向提高不透明度。 */
function paintCellBars(
  column: ColumnFrame,
  cell: FootprintCell,
  bid: number,
  ask: number,
  rect: CellRect,
): void {
  const { frame, x, halfWidth } = column
  const { ctx } = frame
  if (bid > 0) {
    const bidWidth = resolveBarWidth(frame, bid, halfWidth)
    ctx.globalAlpha = cell.bidImbalance ? IMBALANCE_ALPHA : NORMAL_ALPHA
    ctx.fillStyle = frame.bidColor
    ctx.fillRect(x - bidWidth, rect.rectTop, bidWidth, rect.rectHeight)
  }
  if (ask > 0) {
    const askWidth = resolveBarWidth(frame, ask, halfWidth)
    ctx.globalAlpha = cell.askImbalance ? IMBALANCE_ALPHA : NORMAL_ALPHA
    ctx.fillStyle = frame.askColor
    ctx.fillRect(x, rect.rectTop, askWidth, rect.rectHeight)
  }
  // 逐格复位：下一格可能两侧都为零，不应继承上一格的透明度。
  ctx.globalAlpha = 1
}

/** 解析一格的标签文字；Bid Ask 模式给出两侧原值，单值模式给出合计或差。
 *
 * @param frame - 帧级共享快照，文字模式与双列开关取自此处
 * @param cell - 该格数据，紧凑格式化的原始值取自此处
 * @param bid - 已解析的 Bid 数值
 * @param ask - 已解析的 Ask 数值
 * @returns 待显示的 Bid/Ask 文字；单值模式下 Ask 为空串
 */
function resolveLabelText(
  frame: FootprintFrame,
  cell: FootprintCell,
  bid: number,
  ask: number,
): { readonly bid: string; readonly ask: string } {
  if (frame.isBidAsk) return { bid: compactValue(cell.bid), ask: compactValue(cell.ask) }
  // 单值模式使用当前口径的合计或差（Ask − Bid），统一在中轴左侧显示。
  const value = frame.textMode === FOOTPRINT_TEXT_MODES.Volume ? bid + ask : ask - bid
  // 正值显式带 +，负值沿用定点格式化自带的 -，零值不带符号。
  const sign = frame.textMode === FOOTPRINT_TEXT_MODES.Delta && value > 0 ? '+' : ''
  return { bid: `${sign}${compactValue(String(value))}`, ask: '' }
}

/** 收集一格的价位标签；视口上下裁切或文字宽度任一不满足即返回 null。
 *
 * @param column - 列级几何快照，字号与单侧宽度来自此处
 * @param cell - 该格数据，不平衡标记取自此处
 * @param bid - 已解析的 Bid 数值
 * @param ask - 已解析的 Ask 数值
 * @param rect - 该格裁切后的矩形，用于文字垂直居中
 * @returns 待绘制标签；本格不显示数字时返回 null
 */
function collectCellLabel(
  column: ColumnFrame,
  cell: FootprintCell,
  bid: number,
  ask: number,
  rect: CellRect,
): ColumnLabel | null {
  if (column.labelFontSize === 0) return null
  const { frame, halfWidth, labelFontSize } = column
  const { ctx, dpr, isBidAsk, paneHeight } = frame
  const textY = roundToPhysicalPixel((rect.top + rect.bottom) / 2, dpr)
  const halfFontSize = labelFontSize / 2
  // 整行文字出视口时不画，避免留半截数字。
  if (textY - halfFontSize < 0 || textY + halfFontSize > paneHeight) return null
  const text = resolveLabelText(frame, cell, bid, ask)
  // 字号已在列级别定好，这里只校验文字是否放得进单侧宽度。
  ctx.font = getFont(labelFontSize, { bold: true })
  const availableWidth = halfWidth - 4
  if (ctx.measureText(text.bid).width > availableWidth) return null
  if (isBidAsk && ctx.measureText(text.ask).width > availableWidth) return null
  return {
    y: textY,
    fontSize: labelFontSize,
    bid: text.bid,
    ask: text.ask,
    bidImbalance: isBidAsk && cell.bidImbalance,
    askImbalance: cell.askImbalance,
  }
}

/** 逐格绘制一列横条并收集标签；数值上限非正或两侧均为零的格子跳过。
 *
 * @param column - 列级几何快照
 * @param cells - 该列按价格升序排列的价位
 * @returns 已收集标签与最低可见矩形底边
 */
function paintColumnCells(column: ColumnFrame, cells: readonly FootprintCell[]): ColumnPaintResult {
  const labels: ColumnLabel[] = []
  let lowestVisibleY = -Infinity
  for (const cell of cells) {
    const bid = Number(cell.bid)
    const ask = Number(cell.ask)
    // maxValue 可能是 NaN（某档数值无法解析），与空档位一样视为无量可绘；不做零值绘制。
    if (!(column.frame.maxValue > 0) || (bid <= 0 && ask <= 0)) continue
    const rect = resolveCellRect(column.frame, Number(cell.price))
    if (!rect) continue
    lowestVisibleY = Math.max(lowestVisibleY, rect.rectTop + rect.rectHeight)
    paintCellBars(column, cell, bid, ask, rect)
    const label = collectCellLabel(column, cell, bid, ask, rect)
    if (label) labels.push(label)
  }
  return { labels, lowestVisibleY }
}

/** 绘制一列已收集的标签；最后绘制，避免后续价格行的横条覆盖文字。 */
function paintColumnLabels(column: ColumnFrame, labels: readonly ColumnLabel[]): void {
  const { frame, x } = column
  const { ctx, isBidAsk, textColor } = frame
  ctx.globalAlpha = 1
  ctx.textBaseline = 'middle'
  for (const label of labels) {
    ctx.font = getFont(label.fontSize, { bold: label.bidImbalance })
    ctx.textAlign = 'right'
    ctx.fillStyle = textColor
    ctx.fillText(label.bid, x - 2, label.y)
    if (isBidAsk) {
      ctx.font = getFont(label.fontSize, { bold: label.askImbalance })
      ctx.textAlign = 'left'
      ctx.fillStyle = textColor
      ctx.fillText(label.ask, x + 2, label.y)
    }
  }
  ctx.textBaseline = 'alphabetic'
}

/** 绘制柱脚 Delta 汇总；柱脚移出可视区时不吸附到 pane 底部。
 *
 * @param column - 列级几何快照
 * @param deltaText - 该柱 Delta 的定点十进制字符串，保留完整精度
 * @param lowestVisibleY - 柱脚最低可见底边，来自逐格绘制结果
 */
function paintColumnSummary(column: ColumnFrame, deltaText: string, lowestVisibleY: number): void {
  if (column.width < MIN_LABEL_COLUMN_WIDTH || !Number.isFinite(lowestVisibleY)) return
  const { frame, x, width } = column
  const { ctx, askColor, bidColor, paneHeight } = frame
  const summaryY = lowestVisibleY + SUMMARY_OFFSET
  if (summaryY - SUMMARY_FONT_SIZE < 0 || summaryY > paneHeight) return
  const delta = Number(deltaText)
  ctx.font = getFont(SUMMARY_FONT_SIZE)
  ctx.textAlign = 'center'
  ctx.fillStyle = delta >= 0 ? askColor : bidColor
  // 正值显式带 +，负值沿用定点格式化自带的 -，零值不带符号。
  ctx.fillText(`${delta > 0 ? '+' : ''}${compactValue(deltaText)}`, x, summaryY, width)
}

/** 可视区共用数值比例；Bid 从柱中心向左延伸，Ask 向右延伸，零值不绘制。 */
export function createFootprintLayer(
  readState: () => FootprintRenderState | null,
): Layer<RenderContext> {
  return {
    id: makePluginLayerId('footprint'),
    pane: MAIN_PANE_ID,
    visible: true,
    // GPU K 线画布位于 main Canvas2D 上方，足迹内容必须参加覆盖画布绘制。
    role: 'overlay',
    // 足迹成交行和数字必须在 K 线主体之后绘制，避免被实体及影线覆盖。
    z: RENDERER_PRIORITY.OVERLAY,
    paint(context) {
      const state = readState()
      if (!state) return
      const { overlayCtx: ctx, range, kLineCenters, scrollLeft } = context
      if (!ctx) return
      const start = Math.max(0, range.start)
      const end = Math.min(range.end, state.series.bars.length)
      const frame = createFootprintFrame(context, ctx, state, start, end)
      ctx.save()
      for (let index = start; index < end; index++) {
        const bar = state.series.bars[index]
        if (!bar) continue
        const column = resolveColumn(frame, bar, kLineCenters, index - range.start, scrollLeft)
        if (!column) continue
        const { labels, lowestVisibleY } = paintColumnCells(column, bar.cells)
        paintColumnLabels(column, labels)
        paintColumnSummary(column, bar.delta, lowestVisibleY)
      }
      ctx.restore()
    },
    dispose() {},
  }
}

const valueFormatter = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumSignificantDigits: 3,
})
/** 显示精度只在画布格式化边界缩减，计算结果仍保留完整十进制字符串。 */
function compactValue(value: string): string {
  return valueFormatter.format(Number(value))
}

/** 足迹价格行覆盖完整档位宽度，自动缩放不能裁掉最上面一行。
 *
 * @param state - 当前足迹展示状态；null 表示不参与价格范围
 * @param range - 本帧可见柱索引区间
 * @returns 覆盖全部可见档位的价格区间；无可见档位时返回 null
 */
export function computeFootprintPriceRange(
  state: FootprintRenderState | null,
  range: { start: number; end: number },
): { minPrice: number; maxPrice: number } | null {
  if (!state) return null
  let minPrice = Infinity
  let maxPrice = -Infinity
  for (const bar of state.series.bars.slice(Math.max(0, range.start), range.end)) {
    for (const cell of bar?.cells ?? []) {
      minPrice = Math.min(minPrice, Number(cell.price))
      maxPrice = Math.max(maxPrice, Number(cell.price) + Number(state.series.rowSize))
    }
  }
  return Number.isFinite(minPrice) && Number.isFinite(maxPrice) ? { minPrice, maxPrice } : null
}
