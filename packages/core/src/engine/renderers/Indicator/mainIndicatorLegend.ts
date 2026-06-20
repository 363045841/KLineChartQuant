import type { RendererPluginWithHost, PluginHost, RenderContext } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { KLineData, TimeShareData } from '../../../types/price'
import { resolveThemeColors } from '../../../tokens'
import { getFont, setCanvasFont } from '../../theme/fonts'
import type { IndicatorScheduler } from '../../indicators/scheduler'

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
}

/**
 * 创建主图指标图例渲染器插件
 *
 * 统一管理 MA、BOLL 等主图指标的图例显示，支持多行排列
 * MA 数据从 StateStore 读取（与 MA 线渲染器共享同一数据源）
 */
export function createMainIndicatorLegendRendererPlugin(options: {
  yPaddingPx: number
}): RendererPluginWithHost {
  const config: MainIndicatorLegendConfig = {
    yPaddingPx: options.yPaddingPx,
  }

  let pluginHost: PluginHost | null = null

  return {
    name: 'mainIndicatorLegend',
    version: '2.1.0',
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
      const { overlayCtx, data, range, crosshairIndex } = context
      const klineData = data as KLineData[]
      const colors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)
      if (!klineData.length || !overlayCtx) return

      const fontSize = 12
      const lineHeight = fontSize + 6
      const legendX = 12
      const gap = 10
      const legendYOffset = 6

      overlayCtx.save()
      setCanvasFont(overlayCtx, getFont(fontSize))
      overlayCtx.textAlign = 'left'
      overlayCtx.textBaseline = 'top'

      const targetIndex = crosshairIndex ?? Math.min(range.end - 1, klineData.length - 1)
      const rows: Array<{ draw: (rowIndex: number) => void }> = []

      // ── Timeshare legend ──
      if (context.period === 'timeshare') {
        const tsData = data as TimeShareData[]
        const preClose = (context.settings?.preClose as number) ?? tsData[0]?.price ?? 0
        const item = tsData[targetIndex]
        if (item) {
          const changeAmount = item.price - preClose
          const changePercent = preClose !== 0 ? (changeAmount / preClose) * 100 : 0
          const changeColor = changeAmount >= 0 ? colors.candleUpBody : colors.candleDownBody

          if (context.paneWidth >= 400) {
            rows.push({
              draw: (rowIndex: number) => {
                let x = legendX
                const y = config.yPaddingPx / 2 + legendYOffset + rowIndex * lineHeight

                overlayCtx.fillStyle = colors.text.primary
                overlayCtx.fillText('现价 ', x, y)
                x += measureTextWidth(overlayCtx, '现价 ')
                overlayCtx.fillStyle = changeColor
                overlayCtx.fillText(item.price.toFixed(2), x, y)
                x += measureTextWidth(overlayCtx, item.price.toFixed(2)) + gap

                overlayCtx.fillStyle = colors.text.primary
                overlayCtx.fillText('均价 ', x, y)
                x += measureTextWidth(overlayCtx, '均价 ')
                overlayCtx.fillText(item.average.toFixed(2), x, y)
                x += measureTextWidth(overlayCtx, item.average.toFixed(2)) + gap

                overlayCtx.fillStyle = colors.text.primary
                overlayCtx.fillText('涨跌 ', x, y)
                x += measureTextWidth(overlayCtx, '涨跌 ')
                overlayCtx.fillStyle = changeColor
                const sign = changeAmount > 0 ? '+' : ''
                overlayCtx.fillText(`${sign}${changeAmount.toFixed(2)}`, x, y)
                x += measureTextWidth(overlayCtx, `${sign}${changeAmount.toFixed(2)}`) + gap

                overlayCtx.fillStyle = colors.text.primary
                overlayCtx.fillText('涨幅 ', x, y)
                x += measureTextWidth(overlayCtx, '涨幅 ')
                overlayCtx.fillStyle = changeColor
                const pctSign = changePercent > 0 ? '+' : ''
                overlayCtx.fillText(`${pctSign}${changePercent.toFixed(2)}%`, x, y)
                x += measureTextWidth(overlayCtx, `${pctSign}${changePercent.toFixed(2)}%`) + gap

                const volText = formatVolumeShort(item.volume)
                overlayCtx.fillStyle = colors.text.tertiary
                overlayCtx.fillText('成交量 ', x, y)
                x += measureTextWidth(overlayCtx, '成交量 ')
                overlayCtx.fillStyle = colors.text.primary
                overlayCtx.fillText(volText, x, y)
                x += measureTextWidth(overlayCtx, volText) + gap

                const amtText = formatAmountShort(item.amount)
                overlayCtx.fillStyle = colors.text.tertiary
                overlayCtx.fillText('成交额 ', x, y)
                x += measureTextWidth(overlayCtx, '成交额 ')
                overlayCtx.fillStyle = colors.text.primary
                overlayCtx.fillText(amtText, x, y)
              },
            })
          } else {
            rows.push({
              draw: (rowIndex: number) => {
                let x = legendX
                const y = config.yPaddingPx / 2 + legendYOffset + rowIndex * lineHeight

                overlayCtx.fillStyle = colors.text.primary
                overlayCtx.fillText('现价 ', x, y)
                x += measureTextWidth(overlayCtx, '现价 ')
                overlayCtx.fillStyle = changeColor
                overlayCtx.fillText(item.price.toFixed(2), x, y)
                x += measureTextWidth(overlayCtx, item.price.toFixed(2)) + gap

                overlayCtx.fillStyle = colors.text.primary
                overlayCtx.fillText('均价 ', x, y)
                x += measureTextWidth(overlayCtx, '均价 ')
                overlayCtx.fillText(item.average.toFixed(2), x, y)
                x += measureTextWidth(overlayCtx, item.average.toFixed(2)) + gap

                overlayCtx.fillStyle = colors.text.tertiary
                overlayCtx.fillText('成交量 ', x, y)
                x += measureTextWidth(overlayCtx, '成交量 ')
                overlayCtx.fillStyle = colors.text.primary
                overlayCtx.fillText(formatVolumeShort(item.volume), x, y)
              },
            })
            rows.push({
              draw: (rowIndex: number) => {
                let x = legendX
                const y = config.yPaddingPx / 2 + legendYOffset + rowIndex * lineHeight

                overlayCtx.fillStyle = colors.text.primary
                overlayCtx.fillText('涨跌 ', x, y)
                x += measureTextWidth(overlayCtx, '涨跌 ')
                overlayCtx.fillStyle = changeColor
                const sign = changeAmount > 0 ? '+' : ''
                overlayCtx.fillText(`${sign}${changeAmount.toFixed(2)}`, x, y)
                x += measureTextWidth(overlayCtx, `${sign}${changeAmount.toFixed(2)}`) + gap

                overlayCtx.fillStyle = colors.text.primary
                overlayCtx.fillText('涨幅 ', x, y)
                x += measureTextWidth(overlayCtx, '涨幅 ')
                overlayCtx.fillStyle = changeColor
                const pctSign = changePercent > 0 ? '+' : ''
                overlayCtx.fillText(`${pctSign}${changePercent.toFixed(2)}%`, x, y)
                x += measureTextWidth(overlayCtx, `${pctSign}${changePercent.toFixed(2)}%`) + gap

                overlayCtx.fillStyle = colors.text.tertiary
                overlayCtx.fillText('成交额 ', x, y)
                x += measureTextWidth(overlayCtx, '成交额 ')
                overlayCtx.fillStyle = colors.text.primary
                overlayCtx.fillText(formatAmountShort(item.amount), x, y)
              },
            })
          }
        }
      }

      if (typeof crosshairIndex === 'number') {
        const k = klineData[targetIndex]
        if (k && typeof k.close === 'number') {
          const isUp = k.close >= k.open
          const volText = typeof k.volume === 'number' ? formatVolumeShort(k.volume) : null
          const upColor = isUp ? colors.candleUpBody : colors.candleDownBody

          if (context.paneWidth >= 400) {
            rows.push({
              draw: (rowIndex: number) => {
                let x = legendX
                const y = config.yPaddingPx / 2 + legendYOffset + rowIndex * lineHeight

                overlayCtx.fillStyle = colors.text.primary
                overlayCtx.fillText('O ', x, y)
                x += measureTextWidth(overlayCtx, 'O ')
                overlayCtx.fillStyle = upColor
                overlayCtx.fillText(k.open.toFixed(2), x, y)
                x += measureTextWidth(overlayCtx, k.open.toFixed(2)) + gap

                overlayCtx.fillStyle = colors.text.primary
                overlayCtx.fillText('H ', x, y)
                x += measureTextWidth(overlayCtx, 'H ')
                overlayCtx.fillText(k.high.toFixed(2), x, y)
                x += measureTextWidth(overlayCtx, k.high.toFixed(2)) + gap

                overlayCtx.fillText('L ', x, y)
                x += measureTextWidth(overlayCtx, 'L ')
                overlayCtx.fillText(k.low.toFixed(2), x, y)
                x += measureTextWidth(overlayCtx, k.low.toFixed(2)) + gap

                overlayCtx.fillStyle = colors.text.primary
                overlayCtx.fillText('C ', x, y)
                x += measureTextWidth(overlayCtx, 'C ')
                overlayCtx.fillStyle = upColor
                overlayCtx.fillText(k.close.toFixed(2), x, y)
                x += measureTextWidth(overlayCtx, k.close.toFixed(2)) + gap

                if (volText) {
                  overlayCtx.fillStyle = colors.text.tertiary
                  overlayCtx.fillText('Vol ', x, y)
                  x += measureTextWidth(overlayCtx, 'Vol ')
                  overlayCtx.fillStyle = colors.text.primary
                  overlayCtx.fillText(volText, x, y)
                }
              },
            })
          } else {
            rows.push({
              draw: (rowIndex: number) => {
                let x = legendX
                const y = config.yPaddingPx / 2 + legendYOffset + rowIndex * lineHeight

                overlayCtx.fillStyle = colors.text.primary
                overlayCtx.fillText('O ', x, y)
                x += measureTextWidth(overlayCtx, 'O ')
                overlayCtx.fillStyle = upColor
                overlayCtx.fillText(k.open.toFixed(2), x, y)
                x += measureTextWidth(overlayCtx, k.open.toFixed(2)) + gap

                overlayCtx.fillStyle = colors.text.primary
                overlayCtx.fillText('H ', x, y)
                x += measureTextWidth(overlayCtx, 'H ')
                overlayCtx.fillText(k.high.toFixed(2), x, y)
                x += measureTextWidth(overlayCtx, k.high.toFixed(2)) + gap

                overlayCtx.fillText('L ', x, y)
                x += measureTextWidth(overlayCtx, 'L ')
                overlayCtx.fillText(k.low.toFixed(2), x, y)
              },
            })
            rows.push({
              draw: (rowIndex: number) => {
                let x = legendX
                const y = config.yPaddingPx / 2 + legendYOffset + rowIndex * lineHeight

                overlayCtx.fillStyle = colors.text.primary
                overlayCtx.fillText('C ', x, y)
                x += measureTextWidth(overlayCtx, 'C ')
                overlayCtx.fillStyle = upColor
                overlayCtx.fillText(k.close.toFixed(2), x, y)
                x += measureTextWidth(overlayCtx, k.close.toFixed(2)) + gap

                if (volText) {
                  overlayCtx.fillStyle = colors.text.tertiary
                  overlayCtx.fillText('Vol ', x, y)
                  x += measureTextWidth(overlayCtx, 'Vol ')
                  overlayCtx.fillStyle = colors.text.primary
                  overlayCtx.fillText(volText, x, y)
                }
              },
            })
          }
        }
      }

      const scheduler = pluginHost && typeof pluginHost.getService === 'function'
        ? pluginHost.getService<IndicatorScheduler>('indicatorScheduler')
        : undefined

      const mainIndicators = scheduler?.getMainIndicators() ?? []
      for (const meta of mainIndicators) {
        if (!meta.getTitleInfo) continue
        if (!scheduler?.isMainIndicatorActive(meta.name)) continue
        const params = scheduler?.getMainIndicatorParams(meta.name) ?? {}

        const titleInfo = meta.getTitleInfo(
          klineData,
          targetIndex,
          params as Record<string, number | boolean | string>,
          pluginHost!,
          'main',
        )
        if (!titleInfo) continue

        rows.push({
          draw: (rowIndex: number) => {
            let x = legendX
            let y = config.yPaddingPx / 2 + legendYOffset + rowIndex * lineHeight
            overlayCtx.fillStyle = colors.text.primary
            overlayCtx.fillText(titleInfo.name, x, y)
            x += measureTextWidth(overlayCtx, titleInfo.name)

            if (titleInfo.params && titleInfo.params.length > 0) {
              const paramText = `(${titleInfo.params.join(',')})`
              overlayCtx.fillStyle = colors.text.tertiary
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
          }
        })
      }

      pushComparisonLegendRows(context, klineData, targetIndex, range, rows, config.yPaddingPx, overlayCtx, legendX, legendYOffset, lineHeight, gap, colors)

      rows.forEach((row, index) => row.draw(index))
      overlayCtx.restore()
    },

    getConfig() {
      return {
        yPaddingPx: config.yPaddingPx,
      }
    },

    setConfig(newConfig: Record<string, unknown>) {
      if (typeof newConfig.yPaddingPx === 'number') {
        config.yPaddingPx = newConfig.yPaddingPx
      }
    },
  }
}

function pushComparisonLegendRows(
  context: RenderContext,
  klineData: KLineData[],
  targetIndex: number,
  range: { start: number; end: number },
  rows: Array<{ draw: (rowIndex: number) => void }>,
  yPaddingPx: number,
  overlayCtx: CanvasRenderingContext2D,
  legendX: number,
  legendYOffset: number,
  lineHeight: number,
  gap: number,
  colors: ReturnType<typeof resolveThemeColors>,
): void {
  const comparisonSymbols = context.comparisonSymbols
  const comparisonData = context.comparisonData
  const comparisonColors = context.comparisonColors
  if (!comparisonSymbols?.length || !comparisonData?.size) return

  const baseIndex = Math.max(0, range.start)
  const baseItem = klineData[baseIndex]
  if (!baseItem || !Number.isFinite(baseItem.close) || baseItem.close <= 0) return

  const baseDate = baseItem.date ?? ''

  for (const spec of comparisonSymbols) {
    const data = comparisonData.get(spec.symbol)
    if (!data?.length) continue

    const baseline = baseDate
      ? findBaselineByDate(data, baseDate)
      : findBaselineByTimestamp(data, baseItem.timestamp)
    if (!baseline || baseline.close <= 0) continue

    const byDate = new Map<string, KLineData>()
    for (const item of data) {
      byDate.set(item.date ?? String(item.timestamp), item)
    }

    const mainItem = klineData[targetIndex]
    if (!mainItem) continue
    const key = mainItem.date ?? String(mainItem.timestamp)
    const currentItem = byDate.get(key)
    if (!currentItem || !Number.isFinite(currentItem.close)) continue

    const pct = ((currentItem.close - baseline.close) / baseline.close) * 100
    const color = comparisonColors?.get(spec.symbol) ?? '#f59e0b'

    rows.push({
      draw: (rowIndex: number) => {
        let x = legendX
        const y = yPaddingPx / 2 + legendYOffset + rowIndex * lineHeight

        const dotRadius = 4
        overlayCtx.fillStyle = color
        overlayCtx.beginPath()
        const fontSize = lineHeight - 6
        overlayCtx.arc(x + dotRadius, y + fontSize / 2 - 1, dotRadius, 0, Math.PI * 2)
        overlayCtx.fill()
        x += dotRadius * 2 + 4

        overlayCtx.fillStyle = colors.text.primary
        overlayCtx.fillText(spec.symbol, x, y)
        x += measureTextWidth(overlayCtx, spec.symbol) + gap

        const sign = pct > 0 ? '+' : ''
        const pctText = `${sign}${pct.toFixed(2)}%`
        overlayCtx.fillStyle = pct > 0 ? colors.candleUpBody : pct < 0 ? colors.candleDownBody : colors.text.primary
        overlayCtx.fillText(pctText, x, y)
      },
    })
  }
}

function findBaselineByDate(data: ReadonlyArray<KLineData>, date: string): KLineData | null {
  for (const item of data) {
    if (item.date && item.date >= date) return item
  }
  return null
}

function findBaselineByTimestamp(data: ReadonlyArray<KLineData>, timestamp: number): KLineData | null {
  for (const item of data) {
    if (item.timestamp >= timestamp) return item
  }
  return null
}

function formatVolumeShort(v: number): string {
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (v >= 1e4) return (v / 1e4).toFixed(2) + '万'
  return v.toFixed(2)
}

function formatAmountShort(v: number): string {
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (v >= 1e4) return (v / 1e4).toFixed(2) + '万'
  return v.toFixed(2)
}
