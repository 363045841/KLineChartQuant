/** Footprint 标准指标定义及 Layer；复用帧柱中心、价格轴和主题，不创建第二套画布。 */
import { createFootprintCalculator } from '../../../components/footprint/impl/calculateFootprint.js'
import type { FootprintRenderState } from '../../../components/footprint/types.js'
import type { RenderContext } from '../../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../../foundation/tokens/index.js'
import { roundToPhysicalPixel, worldXToScreenX } from '../../../foundation/utils/pixelAlign.js'
import type { Layer } from '../../../rendering/scene/types.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind, readIndicatorSeriesEntry } from '../../indicators/indicatorMetadata.js'
import { createIndicatorRendererLayer } from './shared/indicatorRendererLayer.js'

/** 足迹方向使用独立红灰配色，不随 K 线涨跌配色约定翻转。 */
const FOOTPRINT_COLORS = {
  bid: '#d64b4b',
  ask: '#929292',
  darkText: '#eeeeee',
  lightText: '#303030',
} as const

/** 可视区共用数量比例；Bid 从柱中心向左延伸，Ask 向右延伸，零量不绘制。 */
function createFootprintLayer(
  options: { paneId?: string; instanceId?: string } = {},
): Layer<RenderContext> {
  // biome-ignore lint/suspicious/noConsole: 区分图层未创建与已创建但未进入 paint。
  console.info('[Footprint.layer]', {
    instanceId: options.instanceId,
    paneId: options.paneId ?? 'main',
  })
  let lastDiagnosticAt = -Infinity
  function diagnose(details: Record<string, unknown>): void {
    const now = performance.now()
    if (now - lastDiagnosticAt < 1000) return
    lastDiagnosticAt = now
    // biome-ignore lint/suspicious/noConsole: 用户要求临时诊断 Footprint 实际绘制链路。
    console.info('[Footprint.paint]', {
      instanceId: options.instanceId,
      paneId: options.paneId ?? 'main',
      ...details,
    })
  }
  return createIndicatorRendererLayer({
    definitionId: 'footprint',
    paneId: options.paneId ?? 'main',
    z: RENDERER_PRIORITY.INDICATOR,
    draw(context) {
      const state = options.instanceId
        ? context.indicatorStateReader?.get<FootprintRenderState>(options.instanceId)
        : undefined
      if (!state) {
        diagnose({
          reason: 'missing-instance-state',
          range: context.range,
          centerCount: context.kLineCenters.length,
        })
        return
      }
      const { ctx, pane, range, kLineCenters, scrollLeft } = context
      const start = Math.max(0, range.start)
      const end = Math.min(range.end, state.series.bars.length)
      // 全部可见柱、两侧和所有价位共用一个上限，保证宽度能直接比较成交量。
      let maxVolume = 0
      for (let index = start; index < end; index++) {
        for (const cell of state.series.bars[index]?.cells ?? []) {
          maxVolume = Math.max(maxVolume, Number(cell.bidVolume), Number(cell.askVolume))
        }
      }
      const rowSize = Number(state.series.rowSize)
      const pixel = 1 / context.dpr
      let visibleBars = 0
      let missingBars = 0
      let missingCenters = 0
      let drawnCells = 0
      let outsidePriceCells = 0
      let invalidPriceCells = 0
      let drawnNumbers = 0
      let drawnSides = 0
      let firstCell: Record<string, unknown> | undefined
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      ctx.save()
      ctx.font = '10px sans-serif'
      const statusLabel = {
        idle: '',
        loading: '足迹成交加载中',
        ready: '',
        gap: '足迹成交存在缺口',
        error: '足迹成交加载失败',
        unsupported: '当前品种不支持真实逐笔成交',
      }
      const message = state.series.message ?? statusLabel[state.series.status]
      if (message) {
        ctx.fillStyle = colors.referenceLine.neutral
        ctx.fillText(message, 8, 16)
      }
      for (let index = start; index < end; index++) {
        const bar = state.series.bars[index]
        const visibleIndex = index - range.start
        const center = kLineCenters[visibleIndex]
        if (!bar) {
          missingBars++
          continue
        }
        visibleBars++
        if (center === undefined || !Number.isFinite(center)) {
          missingCenters++
          continue
        }
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
          firstCell ??= { timestamp: bar.timestamp, price: cell.price, x, y, top, height, width }
          if (!Number.isFinite(y) || !Number.isFinite(nextY) || !Number.isFinite(maxVolume)) {
            invalidPriceCells++
            continue
          }
          if (bottom <= 0 || top >= pane.height) {
            outsidePriceCells++
            continue
          }
          const bid = Number(cell.bidVolume)
          const ask = Number(cell.askVolume)
          if (maxVolume <= 0 || (bid <= 0 && ask <= 0)) continue
          drawnCells++
          // 高度表示价格档位，宽度只表示成交量；档位之间留一个物理像素间隔。
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
              Math.max(pixel, roundToPhysicalPixel((halfWidth * bid) / maxVolume, context.dpr)),
            )
            ctx.globalAlpha = cell.bidImbalance ? 0.75 : 0.4
            ctx.fillStyle = FOOTPRINT_COLORS.bid
            ctx.fillRect(x - bidWidth, rectTop, bidWidth, rectHeight)
            drawnSides++
          }
          if (ask > 0) {
            const askWidth = Math.min(
              halfWidth,
              Math.max(pixel, roundToPhysicalPixel((halfWidth * ask) / maxVolume, context.dpr)),
            )
            ctx.globalAlpha = cell.askImbalance ? 0.75 : 0.4
            ctx.fillStyle = FOOTPRINT_COLORS.ask
            ctx.fillRect(x, rectTop, askWidth, rectHeight)
            drawnSides++
          }
          ctx.globalAlpha = 1
          if (width >= 40) {
            // 行高不足时仍允许稀疏价位显示数字；只跳过会重叠的标签。
            // cells 按价格升序排列，所以标签从屏幕下方向上方排布。
            const fontSize = Math.max(8, Math.min(10, Math.floor(height - 2)))
            const textY = roundToPhysicalPixel((top + bottom) / 2, context.dpr)
            const textTop = textY - fontSize / 2
            const textBottom = textY + fontSize / 2
            const bidText = compactVolume(cell.bidVolume)
            const askText = compactVolume(cell.askVolume)
            ctx.font = `bold ${fontSize}px sans-serif`
            const availableWidth = halfWidth - 4
            if (
              textTop >= 0 && textBottom <= pane.height &&
              textBottom + 2 <= previousLabelTop &&
              ctx.measureText(bidText).width <= availableWidth &&
              ctx.measureText(askText).width <= availableWidth
            ) {
              labels.push({
                y: textY, fontSize, bid: bidText, ask: askText,
                bidImbalance: cell.bidImbalance, askImbalance: cell.askImbalance,
              })
              previousLabelTop = textTop
            }
          }
        }
        // 最后绘制标签，避免后续价格行的横条覆盖文字；两侧均保留固定中心对齐。
        ctx.globalAlpha = 1
        ctx.textBaseline = 'middle'
        for (const label of labels) {
          ctx.font = `${label.bidImbalance ? 'bold ' : ''}${label.fontSize}px sans-serif`
          ctx.textAlign = 'right'
          ctx.fillStyle = context.theme === 'dark' ? FOOTPRINT_COLORS.darkText : FOOTPRINT_COLORS.lightText
          ctx.fillText(label.bid, x - 2, label.y)
          ctx.font = `${label.askImbalance ? 'bold ' : ''}${label.fontSize}px sans-serif`
          ctx.textAlign = 'left'
          ctx.fillStyle = context.theme === 'dark' ? FOOTPRINT_COLORS.darkText : FOOTPRINT_COLORS.lightText
          ctx.fillText(label.ask, x + 2, label.y)
          drawnNumbers++
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
          ctx.font = '10px sans-serif'
          ctx.textAlign = 'center'
          ctx.fillStyle = Number(bar.delta) >= 0 ? FOOTPRINT_COLORS.ask : FOOTPRINT_COLORS.bid
          ctx.fillText(`Δ${compactVolume(bar.delta)}`, x, summaryY, width)
        }
      }
      ctx.restore()
      diagnose({
        reason: drawnCells > 0 ? 'painted' : 'no-visible-cells',
        status: state.series.status,
        message: state.series.message,
        asOf: state.series.asOf,
        rowSize: state.series.rowSize,
        range: { ...range },
        seriesBarCount: state.series.bars.length,
        loadedBarCount: state.series.bars.filter((bar) => bar !== undefined).length,
        centerCount: kLineCenters.length,
        scrollLeft,
        paneHeight: pane.height,
        visibleBars,
        missingBars,
        missingCenters,
        drawnCells,
        drawnSides,
        maxVolume,
        drawnNumbers,
        outsidePriceCells,
        invalidPriceCells,
        firstCell,
      })
    },
  })
}

const volumeFormatter = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumSignificantDigits: 3,
})
/** 显示精度只在画布格式化边界缩减，计算结果仍保留完整十进制字符串。 */
function compactVolume(value: string): string {
  return volumeFormatter.format(Number(value))
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
