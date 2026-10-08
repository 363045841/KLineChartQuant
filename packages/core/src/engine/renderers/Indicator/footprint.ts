/** Footprint 标准指标定义及 Layer；复用帧柱中心、价格轴和 token 配色，不创建第二套画布。 */
import { createFootprintCalculator } from '../../../components/footprint/impl/calculateFootprint.js'
import type { FootprintRenderState } from '../../../components/footprint/types.js'
import { TRADE_STATUS_LABEL } from '../../../data/trades/types.js'
import type { RenderContext } from '../../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index.js'
import { getFont } from '../../../foundation/tokens/fonts.js'
import { resolveThemeColors } from '../../../foundation/tokens/index.js'
import { roundToPhysicalPixel, worldXToScreenX } from '../../../foundation/utils/pixelAlign.js'
import type { Layer } from '../../../rendering/scene/types.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind, readIndicatorSeriesEntry } from '../../indicators/indicatorMetadata.js'
import { createIndicatorRendererLayer } from './shared/indicatorRendererLayer.js'

/** 不平衡方向的不透明度；透明度不是颜色，故不进入 token。 */
const IMBALANCE_ALPHA = 0.75
/** 普通方向的不透明度。 */
const NORMAL_ALPHA = 0.4

/** 可视区共用成交额比例；Bid 从柱中心向左延伸，Ask 向右延伸，零值不绘制。 */
function createFootprintLayer(
  options: { paneId?: string; instanceId?: string } = {},
): Layer<RenderContext> {
  return createIndicatorRendererLayer({
    definitionId: 'footprint',
    paneId: options.paneId ?? 'main',
    z: RENDERER_PRIORITY.INDICATOR,
    draw(context) {
      const state = options.instanceId
        ? context.indicatorStateReader?.get<FootprintRenderState>(options.instanceId)
        : undefined
      if (!state) return
      const { ctx, pane, range, kLineCenters, scrollLeft } = context
      const start = Math.max(0, range.start)
      const end = Math.min(range.end, state.series.bars.length)
      // 全部可见柱、两侧和所有价位共用一个上限，保证宽度能直接比较成交额。
      let maxValue = 0
      for (let index = start; index < end; index++) {
        for (const cell of state.series.bars[index]?.cells ?? []) {
          maxValue = Math.max(maxValue, Number(cell.bidValue), Number(cell.askValue))
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
      ctx.font = getFont(10)
      const message = state.series.message ?? TRADE_STATUS_LABEL[state.series.status]
      if (message) {
        ctx.fillStyle = colors.referenceLine.neutral
        ctx.fillText(message, 8, 16)
      }
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
        let lowestVisibleY = -Infinity
        const labels: {
          y: number
          fontSize: number
          bid: string
          ask: string
          bidImbalance: boolean
          askImbalance: boolean
        }[] = []
        let previousLabelTop = Infinity
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
          const bid = Number(cell.bidValue)
          const ask = Number(cell.askValue)
          if (maxValue <= 0 || (bid <= 0 && ask <= 0)) continue
          // 高度表示价格档位，宽度只表示成交额；档位之间留一个物理像素间隔。
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
          if (width >= 40) {
            // 行高不足时仍允许稀疏价位显示数字；只跳过会重叠的标签。
            // cells 按价格升序排列，所以标签从屏幕下方向上方排布。
            const fontSize = Math.max(8, Math.min(10, Math.floor(height - 2)))
            const textY = roundToPhysicalPixel((top + bottom) / 2, context.dpr)
            const textTop = textY - fontSize / 2
            const textBottom = textY + fontSize / 2
            const bidText = compactValue(cell.bidValue)
            const askText = compactValue(cell.askValue)
            ctx.font = getFont(fontSize, { bold: true })
            const availableWidth = halfWidth - 4
            if (
              textTop >= 0 &&
              textBottom <= pane.height &&
              textBottom + 2 <= previousLabelTop &&
              ctx.measureText(bidText).width <= availableWidth &&
              ctx.measureText(askText).width <= availableWidth
            ) {
              labels.push({
                y: textY,
                fontSize,
                bid: bidText,
                ask: askText,
                bidImbalance: cell.bidImbalance,
                askImbalance: cell.askImbalance,
              })
              previousLabelTop = textTop
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
          ctx.font = getFont(label.fontSize, { bold: label.askImbalance })
          ctx.textAlign = 'left'
          ctx.fillStyle = footprintColors.text
          ctx.fillText(label.ask, x + 2, label.y)
        }
        ctx.textBaseline = 'alphabetic'
        if (!bar.complete) {
          ctx.strokeStyle = colors.referenceLine.neutral
          ctx.setLineDash([2, 2])
          ctx.strokeRect(x - width / 2, 2, width, 6)
          ctx.setLineDash([])
        }
        if (width >= 40 && Number.isFinite(lowestVisibleY)) {
          const summaryY = Math.min(pane.height - 4, lowestVisibleY + 14)
          ctx.font = getFont(10)
          ctx.textAlign = 'center'
          ctx.fillStyle = Number(bar.delta) >= 0 ? footprintColors.ask : footprintColors.bid
          ctx.fillText(`Δ${compactValue(bar.delta)}`, x, summaryY, width)
        }
      }
      ctx.restore()
    },
  })
}

const valueFormatter = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumSignificantDigits: 3,
})
/** 显示精度只在画布格式化边界缩减，计算结果仍保留完整十进制字符串。 */
function compactValue(value: string): string {
  return valueFormatter.format(Number(value))
}

@Indicator({
  name: 'footprint',
  displayName: 'Footprint',
  kind: IndicatorKind.Indicator,
  category: 'main',
  indicatorType: 'volume',
  defaultPaneId: 'main',
  runtime: {
    inputs: ['trades'],
    defaultParams: { ticksPerRow: 300, imbalanceRatio: 3 },
    computeKey: 'calcFootprint',
    createCompute: createFootprintCalculator,
    compute: (data, params, trades) => createFootprintCalculator()(data, params, trades),
  },
  mainPane: {
    /** 价格行覆盖完整档位宽度，与蜡烛价格范围合并后仍使用原有主图价格轴。 */
    computePriceRange(entry, range) {
      const source = readIndicatorSeriesEntry<FootprintRenderState>(entry, 'footprint')
      let min = Infinity
      let max = -Infinity
      for (const bar of source.series.bars.slice(Math.max(0, range.start), range.end)) {
        const first = bar?.cells[0]
        const last = bar?.cells[bar.cells.length - 1]
        if (!first || !last) continue
        min = Math.min(min, Number(first.price))
        max = Math.max(max, Number(last.price) + Number(source.series.rowSize))
      }
      return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null
    },
    composeRenderState(entry, _range, timestamp) {
      const source = readIndicatorSeriesEntry<FootprintRenderState>(entry, 'footprint')
      return { series: source.series, timestamp }
    },
  },
})
export class FootprintIndicatorDefinition {
  static rendererFactory = createFootprintLayer
}
