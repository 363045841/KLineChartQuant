/** 足迹主序列 Layer；直接消费内核足迹状态，共享 K 线坐标和覆盖画布。 */
import type {
  FootprintCell,
  FootprintRenderState,
} from '@/components/footprint/types.js'
import {
  FOOTPRINT_TEXT_MODES,
} from '@/components/footprint/types.js'
import { makePluginLayerId } from '@/foundation/plugin/impl/rendererLayerId.js'
import { MAIN_PANE_ID } from '@/engine/pane/types.js'
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

/** 可视区共用数值比例；Bid 从柱中心向左延伸，Ask 向右延伸，零值不绘制。 */
export function createFootprintLayer(readState: () => FootprintRenderState | null): Layer<RenderContext> {
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
      const textMode = state.textMode
      const isBidAsk = textMode === FOOTPRINT_TEXT_MODES.BidAsk
      const { overlayCtx: ctx, pane, range, kLineCenters, scrollLeft } = context
      if (!ctx) return
      const start = Math.max(0, range.start)
      const end = Math.min(range.end, state.series.bars.length)
      // 全部可见柱、两侧和所有价位共用一个上限，保证宽度能直接比较数值。
      let maxValue = 0
      for (let index = start; index < end; index++) {
        for (const cell of state.series.bars[index]?.cells ?? []) {
          maxValue = Math.max(maxValue, Number(cell.bid), Number(cell.ask))
        }
      }
      const rowSize = Number(state.series.rowSize)
      const pixel = 1 / context.dpr
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const footprintColors = colors.footprintCell
      ctx.save()
      for (let index = start; index < end; index++) {
        const bar = state.series.bars[index]
        const visibleIndex = index - range.start
        const center = kLineCenters[visibleIndex]
        if (!bar) continue
        if (center === undefined || !Number.isFinite(center)) continue
        const x = worldXToScreenX(center, scrollLeft, context.dpr)
        const spacing =
          kLineCenters[visibleIndex + 1] !== undefined
            ? kLineCenters[visibleIndex + 1]! - center
            : center - (kLineCenters[visibleIndex - 1] ?? center - context.kWidth - context.kGap)
        const halfWidth = Math.max(pixel, roundToPhysicalPixel((spacing - 4) / 2, context.dpr))
        const width = halfWidth * 2
        // 标签是否显示在列级别一次算定，避免逐行像素取整导致同列时有时无。
        const labelFontSize = resolveLabelFontSize(
          bar.cells,
          (price) => pane.yAxis.priceToY(price),
          rowSize,
          width,
          context.dpr,
        )
        let lowestVisibleY = -Infinity
        const labels: {
          y: number
          fontSize: number
          bid: string
          ask: string
          bidImbalance: boolean
          askImbalance: boolean
        }[] = []
        for (const cell of bar.cells) {
          const price = Number(cell.price)
          const y = pane.yAxis.priceToY(price)
          const nextY = pane.yAxis.priceToY(price + rowSize)
          const top = roundToPhysicalPixel(Math.min(y, nextY), context.dpr)
          const bottom = roundToPhysicalPixel(Math.max(y, nextY), context.dpr)
          const height = Math.max(pixel, bottom - top)
          if (!Number.isFinite(y) || !Number.isFinite(nextY) || !Number.isFinite(maxValue)) {
            continue
          }
          if (bottom <= 0 || top >= pane.height) continue
          const bid = Number(cell.bid)
          const ask = Number(cell.ask)
          if (maxValue <= 0 || (bid <= 0 && ask <= 0)) continue
          // 高度表示价格档位，宽度只表示当前口径数值；档位之间留一个物理像素间隔。
          const gap = height >= 3 * pixel ? pixel : 0
          const rectTop = Math.max(0, top)
          const rectBottom = Math.min(
            roundToPhysicalPixel(pane.height, context.dpr),
            top + height - gap,
          )
          const rectHeight = rectBottom - rectTop
          if (rectHeight <= 0) continue
          lowestVisibleY = Math.max(lowestVisibleY, rectBottom)
          if (bid > 0) {
            const bidWidth = Math.min(
              halfWidth,
              Math.max(pixel, roundToPhysicalPixel((halfWidth * bid) / maxValue, context.dpr)),
            )
            ctx.globalAlpha = cell.bidImbalance ? IMBALANCE_ALPHA : NORMAL_ALPHA
            ctx.fillStyle = footprintColors.bid
            ctx.fillRect(x - bidWidth, rectTop, bidWidth, rectHeight)
          }
          if (ask > 0) {
            const askWidth = Math.min(
              halfWidth,
              Math.max(pixel, roundToPhysicalPixel((halfWidth * ask) / maxValue, context.dpr)),
            )
            ctx.globalAlpha = cell.askImbalance ? IMBALANCE_ALPHA : NORMAL_ALPHA
            ctx.fillStyle = footprintColors.ask
            ctx.fillRect(x, rectTop, askWidth, rectHeight)
          }
          ctx.globalAlpha = 1
          if (labelFontSize > 0) {
            // 行距已在列级别校验，这里只处理视口上下裁切与单侧文字过宽。
            const textY = roundToPhysicalPixel((top + bottom) / 2, context.dpr)
            const textTop = textY - labelFontSize / 2
            const textBottom = textY + labelFontSize / 2
            // 单值模式使用当前口径的合计或差（Ask − Bid），统一在中轴左侧显示。
            const value = textMode === FOOTPRINT_TEXT_MODES.Volume ? bid + ask : ask - bid
            const bidText = isBidAsk
              ? compactValue(cell.bid)
              : `${textMode === FOOTPRINT_TEXT_MODES.Delta && value > 0 ? '+' : ''}${compactValue(String(value))}`
            const askText = isBidAsk ? compactValue(cell.ask) : ''
            ctx.font = getFont(labelFontSize, { bold: true })
            const availableWidth = halfWidth - 4
            if (
              textTop >= 0 &&
              textBottom <= pane.height &&
              ctx.measureText(bidText).width <= availableWidth &&
              (!isBidAsk || ctx.measureText(askText).width <= availableWidth)
            ) {
              labels.push({
                y: textY,
                fontSize: labelFontSize,
                bid: bidText,
                ask: askText,
                bidImbalance: isBidAsk && cell.bidImbalance,
                askImbalance: cell.askImbalance,
              })
            }
          }
        }
        // 最后绘制标签，避免后续价格行的横条覆盖文字；两侧均保留固定中心对齐。
        ctx.globalAlpha = 1
        ctx.textBaseline = 'middle'
        for (const label of labels) {
          ctx.font = getFont(label.fontSize, { bold: label.bidImbalance })
          ctx.textAlign = 'right'
          ctx.fillStyle = footprintColors.text
          ctx.fillText(label.bid, x - 2, label.y)
          if (isBidAsk) {
            ctx.font = getFont(label.fontSize, { bold: label.askImbalance })
            ctx.textAlign = 'left'
            ctx.fillStyle = footprintColors.text
            ctx.fillText(label.ask, x + 2, label.y)
          }
        }
        ctx.textBaseline = 'alphabetic'
        if (width >= MIN_LABEL_COLUMN_WIDTH && Number.isFinite(lowestVisibleY)) {
          // Delta 只跟随柱脚自然位置绘制；柱脚移出可视区后不再吸附到 pane 底部。
          const summaryY = lowestVisibleY + SUMMARY_OFFSET
          const summaryTop = summaryY - SUMMARY_FONT_SIZE
          if (summaryTop >= 0 && summaryY <= pane.height) {
            const delta = Number(bar.delta)
            ctx.font = getFont(SUMMARY_FONT_SIZE)
            ctx.textAlign = 'center'
            ctx.fillStyle = delta >= 0 ? footprintColors.ask : footprintColors.bid
            // 正值显式带 +，负值沿用定点格式化自带的 -，零值不带符号。
            ctx.fillText(`${delta > 0 ? '+' : ''}${compactValue(bar.delta)}`, x, summaryY, width)
          }
        }
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

/** 足迹价格行覆盖完整档位宽度，自动缩放不能裁掉最上面一行。 */
export function computeFootprintPriceRange(state: FootprintRenderState | null, range: { start: number; end: number }): { minPrice: number; maxPrice: number } | null {
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
