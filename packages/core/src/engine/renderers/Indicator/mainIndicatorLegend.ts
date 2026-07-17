import type {
  RendererPluginWithHost,
  PluginHost,
  RenderContext,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { getFont, setCanvasFont } from '../../../foundation/tokens/fonts'

import {
  buildLegendTemplateContext,
  type LegendRenderMode,
  type LegendTemplateContext,
} from './mainIndicatorLegendContext'

const textWidthCache = new Map<string, number>()
const TEXT_WIDTH_CACHE_LIMIT = 512

function measureTextWidth(ctx: CanvasRenderingContext2D, text: string): number {
  const key = `${ctx.font}\n${text}`
  const cached = textWidthCache.get(key)
  if (cached !== undefined) {
    return cached
  }

  const width = ctx.measureText(text).width
  if (textWidthCache.size >= TEXT_WIDTH_CACHE_LIMIT) {
    textWidthCache.clear()
  }
  textWidthCache.set(key, width)
  return width
}

/** 渲染器配置 */
interface MainIndicatorLegendConfig {
  yPaddingPx: number
  /** canvas 默认绘制；external 仅发布上下文 */
  renderMode: LegendRenderMode
}

export type MainIndicatorLegendOptions = {
  yPaddingPx: number
  /** 每帧构建后的图例上下文回调（canvas / external 均触发） */
  onContext?: (ctx: LegendTemplateContext | null) => void
}

/**
 * 创建主图指标图例渲染器插件
 *
 * 统一管理 MA、BOLL 等主图指标的图例显示，支持多行排列
 * MA 数据从 StateStore 读取（与 MA 线渲染器共享同一数据源）
 */
export function createMainIndicatorLegendRendererPlugin(
  options: MainIndicatorLegendOptions,
): RendererPluginWithHost {
  const config: MainIndicatorLegendConfig = {
    yPaddingPx: options.yPaddingPx,
    renderMode: 'canvas',
  }
  const onContext = options.onContext

  let pluginHost: PluginHost | null = null

  return {
    name: 'mainIndicatorLegend',
    version: '2.2.0',
    description: '主图指标图例渲染器（MA 数据来自 StateStore）',
    debugName: '主图指标图例',
    paneId: 'main',
    priority: RENDERER_PRIORITY.FOREGROUND,
    layer: 'overlay',
    enabled: true,

    onInstall(host: PluginHost): void {
      pluginHost = host
    },

    getDeclaredNamespaces(): string[] {
      return []
    },

    draw(context: RenderContext) {
      const legend = buildLegendTemplateContext({
        context,
        host: pluginHost,
        yPaddingPx: config.yPaddingPx,
      })
      onContext?.(legend)

      if (config.renderMode === 'external') return
      if (!legend || !context.overlayCtx) return

      paintLegendOnCanvas(context.overlayCtx, legend)
    },

    getConfig() {
      return {
        yPaddingPx: config.yPaddingPx,
        renderMode: config.renderMode,
      }
    },

    setConfig(newConfig: Record<string, unknown>) {
      if (typeof newConfig.yPaddingPx === 'number') {
        config.yPaddingPx = newConfig.yPaddingPx
      }
      if (newConfig.renderMode === 'canvas' || newConfig.renderMode === 'external') {
        config.renderMode = newConfig.renderMode
      }
    },
  }
}

function paintLegendOnCanvas(overlayCtx: CanvasRenderingContext2D, legend: LegendTemplateContext) {
  const { layout, colors } = legend
  const fontSize = 12
  const { x: legendX, y: baseY, lineHeight, gap, compact } = layout

  overlayCtx.save()
  setCanvasFont(overlayCtx, getFont(fontSize))
  overlayCtx.textAlign = 'left'
  overlayCtx.textBaseline = 'top'

  let rowIndex = 0

  const rowY = () => baseY + rowIndex * lineHeight

  if (legend.timeshare) {
    const ts = legend.timeshare
    if (!compact) {
      let x = legendX
      const y = rowY()
      overlayCtx.fillStyle = colors.textPrimary
      overlayCtx.fillText('现价 ', x, y)
      x += measureTextWidth(overlayCtx, '现价 ')
      overlayCtx.fillStyle = ts.changeColor
      overlayCtx.fillText(ts.price.toFixed(2), x, y)
      x += measureTextWidth(overlayCtx, ts.price.toFixed(2)) + gap

      overlayCtx.fillStyle = colors.textPrimary
      overlayCtx.fillText('均价 ', x, y)
      x += measureTextWidth(overlayCtx, '均价 ')
      overlayCtx.fillText(ts.average.toFixed(2), x, y)
      x += measureTextWidth(overlayCtx, ts.average.toFixed(2)) + gap

      overlayCtx.fillStyle = colors.textPrimary
      overlayCtx.fillText('涨跌 ', x, y)
      x += measureTextWidth(overlayCtx, '涨跌 ')
      overlayCtx.fillStyle = ts.changeColor
      const sign = ts.changeAmount > 0 ? '+' : ''
      overlayCtx.fillText(`${sign}${ts.changeAmount.toFixed(2)}`, x, y)
      x += measureTextWidth(overlayCtx, `${sign}${ts.changeAmount.toFixed(2)}`) + gap

      overlayCtx.fillStyle = colors.textPrimary
      overlayCtx.fillText('涨幅 ', x, y)
      x += measureTextWidth(overlayCtx, '涨幅 ')
      overlayCtx.fillStyle = ts.changeColor
      const pctSign = ts.changePercent > 0 ? '+' : ''
      overlayCtx.fillText(`${pctSign}${ts.changePercent.toFixed(2)}%`, x, y)
      x += measureTextWidth(overlayCtx, `${pctSign}${ts.changePercent.toFixed(2)}%`) + gap

      overlayCtx.fillStyle = colors.textTertiary
      overlayCtx.fillText('成交量 ', x, y)
      x += measureTextWidth(overlayCtx, '成交量 ')
      overlayCtx.fillStyle = colors.textPrimary
      overlayCtx.fillText(ts.volumeText, x, y)
      x += measureTextWidth(overlayCtx, ts.volumeText) + gap

      overlayCtx.fillStyle = colors.textTertiary
      overlayCtx.fillText('成交额 ', x, y)
      x += measureTextWidth(overlayCtx, '成交额 ')
      overlayCtx.fillStyle = colors.textPrimary
      overlayCtx.fillText(ts.amountText, x, y)
      rowIndex++
    } else {
      {
        let x = legendX
        const y = rowY()
        overlayCtx.fillStyle = colors.textPrimary
        overlayCtx.fillText('现价 ', x, y)
        x += measureTextWidth(overlayCtx, '现价 ')
        overlayCtx.fillStyle = ts.changeColor
        overlayCtx.fillText(ts.price.toFixed(2), x, y)
        x += measureTextWidth(overlayCtx, ts.price.toFixed(2)) + gap

        overlayCtx.fillStyle = colors.textPrimary
        overlayCtx.fillText('均价 ', x, y)
        x += measureTextWidth(overlayCtx, '均价 ')
        overlayCtx.fillText(ts.average.toFixed(2), x, y)
        x += measureTextWidth(overlayCtx, ts.average.toFixed(2)) + gap

        overlayCtx.fillStyle = colors.textTertiary
        overlayCtx.fillText('成交量 ', x, y)
        x += measureTextWidth(overlayCtx, '成交量 ')
        overlayCtx.fillStyle = colors.textPrimary
        overlayCtx.fillText(ts.volumeText, x, y)
        rowIndex++
      }
      {
        let x = legendX
        const y = rowY()
        overlayCtx.fillStyle = colors.textPrimary
        overlayCtx.fillText('涨跌 ', x, y)
        x += measureTextWidth(overlayCtx, '涨跌 ')
        overlayCtx.fillStyle = ts.changeColor
        const sign = ts.changeAmount > 0 ? '+' : ''
        overlayCtx.fillText(`${sign}${ts.changeAmount.toFixed(2)}`, x, y)
        x += measureTextWidth(overlayCtx, `${sign}${ts.changeAmount.toFixed(2)}`) + gap

        overlayCtx.fillStyle = colors.textPrimary
        overlayCtx.fillText('涨幅 ', x, y)
        x += measureTextWidth(overlayCtx, '涨幅 ')
        overlayCtx.fillStyle = ts.changeColor
        const pctSign = ts.changePercent > 0 ? '+' : ''
        overlayCtx.fillText(`${pctSign}${ts.changePercent.toFixed(2)}%`, x, y)
        x += measureTextWidth(overlayCtx, `${pctSign}${ts.changePercent.toFixed(2)}%`) + gap

        overlayCtx.fillStyle = colors.textTertiary
        overlayCtx.fillText('成交额 ', x, y)
        x += measureTextWidth(overlayCtx, '成交额 ')
        overlayCtx.fillStyle = colors.textPrimary
        overlayCtx.fillText(ts.amountText, x, y)
        rowIndex++
      }
    }
  }

  if (legend.ohlc) {
    const k = legend.ohlc
    if (!compact) {
      let x = legendX
      const y = rowY()
      overlayCtx.fillStyle = colors.textPrimary
      overlayCtx.fillText('O ', x, y)
      x += measureTextWidth(overlayCtx, 'O ')
      overlayCtx.fillStyle = k.color
      overlayCtx.fillText(k.open.toFixed(2), x, y)
      x += measureTextWidth(overlayCtx, k.open.toFixed(2)) + gap

      overlayCtx.fillStyle = colors.textPrimary
      overlayCtx.fillText('H ', x, y)
      x += measureTextWidth(overlayCtx, 'H ')
      overlayCtx.fillText(k.high.toFixed(2), x, y)
      x += measureTextWidth(overlayCtx, k.high.toFixed(2)) + gap

      overlayCtx.fillText('L ', x, y)
      x += measureTextWidth(overlayCtx, 'L ')
      overlayCtx.fillText(k.low.toFixed(2), x, y)
      x += measureTextWidth(overlayCtx, k.low.toFixed(2)) + gap

      overlayCtx.fillStyle = colors.textPrimary
      overlayCtx.fillText('C ', x, y)
      x += measureTextWidth(overlayCtx, 'C ')
      overlayCtx.fillStyle = k.color
      overlayCtx.fillText(k.close.toFixed(2), x, y)
      x += measureTextWidth(overlayCtx, k.close.toFixed(2)) + gap

      if (k.volumeText) {
        overlayCtx.fillStyle = colors.textTertiary
        overlayCtx.fillText('Vol ', x, y)
        x += measureTextWidth(overlayCtx, 'Vol ')
        overlayCtx.fillStyle = colors.textPrimary
        overlayCtx.fillText(k.volumeText, x, y)
      }
      rowIndex++
    } else {
      {
        let x = legendX
        const y = rowY()
        overlayCtx.fillStyle = colors.textPrimary
        overlayCtx.fillText('O ', x, y)
        x += measureTextWidth(overlayCtx, 'O ')
        overlayCtx.fillStyle = k.color
        overlayCtx.fillText(k.open.toFixed(2), x, y)
        x += measureTextWidth(overlayCtx, k.open.toFixed(2)) + gap

        overlayCtx.fillStyle = colors.textPrimary
        overlayCtx.fillText('H ', x, y)
        x += measureTextWidth(overlayCtx, 'H ')
        overlayCtx.fillText(k.high.toFixed(2), x, y)
        x += measureTextWidth(overlayCtx, k.high.toFixed(2)) + gap

        overlayCtx.fillText('L ', x, y)
        x += measureTextWidth(overlayCtx, 'L ')
        overlayCtx.fillText(k.low.toFixed(2), x, y)
        rowIndex++
      }
      {
        let x = legendX
        const y = rowY()
        overlayCtx.fillStyle = colors.textPrimary
        overlayCtx.fillText('C ', x, y)
        x += measureTextWidth(overlayCtx, 'C ')
        overlayCtx.fillStyle = k.color
        overlayCtx.fillText(k.close.toFixed(2), x, y)
        x += measureTextWidth(overlayCtx, k.close.toFixed(2)) + gap

        if (k.volumeText) {
          overlayCtx.fillStyle = colors.textTertiary
          overlayCtx.fillText('Vol ', x, y)
          x += measureTextWidth(overlayCtx, 'Vol ')
          overlayCtx.fillStyle = colors.textPrimary
          overlayCtx.fillText(k.volumeText, x, y)
        }
        rowIndex++
      }
    }
  }

  for (const titleInfo of legend.indicators) {
    let x = legendX
    let y = rowY()
    overlayCtx.fillStyle = colors.textPrimary
    overlayCtx.fillText(titleInfo.name, x, y)
    x += measureTextWidth(overlayCtx, titleInfo.name)

    if (titleInfo.params && titleInfo.params.length > 0) {
      const paramText = `(${titleInfo.params.join(',')})`
      overlayCtx.fillStyle = colors.textTertiary
      overlayCtx.fillText(paramText, x, y)
      x += measureTextWidth(overlayCtx, paramText) + gap
    } else {
      x += gap
    }

    if (titleInfo.values) {
      y += 1
      for (const item of titleInfo.values) {
        const valText = `${item.label} ${item.value.toFixed(3)}`
        overlayCtx.fillStyle = item.color
        overlayCtx.fillText(valText, x, y)
        x += measureTextWidth(overlayCtx, valText) + gap
      }
    }
    rowIndex++
  }

  for (const cmp of legend.comparisons) {
    let x = legendX
    const y = rowY()
    const dotRadius = 4
    overlayCtx.fillStyle = cmp.color
    overlayCtx.beginPath()
    overlayCtx.arc(x + dotRadius, y + fontSize / 2 - 1, dotRadius, 0, Math.PI * 2)
    overlayCtx.fill()
    x += dotRadius * 2 + 4

    overlayCtx.fillStyle = colors.textPrimary
    overlayCtx.fillText(cmp.symbol, x, y)
    x += measureTextWidth(overlayCtx, cmp.symbol) + gap

    const sign = cmp.percent > 0 ? '+' : ''
    const pctText = `${sign}${cmp.percent.toFixed(2)}%`
    overlayCtx.fillStyle = cmp.percentColor
    overlayCtx.fillText(pctText, x, y)
    rowIndex++
  }

  overlayCtx.restore()
}
