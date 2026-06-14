import type { RendererPluginWithHost, PluginHost, RenderContext } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { KLineData } from '../../../types/price'
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

      const scheduler = pluginHost && typeof pluginHost.getService === 'function'
        ? pluginHost.getService<IndicatorScheduler>('indicatorScheduler')
        : undefined

      const mainIndicators = scheduler?.getMainIndicators() ?? []
      for (const meta of mainIndicators) {
        if (!meta.getTitleInfo) continue
        if (!scheduler?.isMainIndicatorActive(meta.name)) continue
        const params = scheduler?.getMainIndicatorParams(meta.name) ?? {}
        const getTitleInfo = meta.getTitleInfo

        rows.push({
          draw: (rowIndex: number) => {
            const titleInfo = getTitleInfo(
              klineData,
              targetIndex,
              params as Record<string, number | boolean | string>,
              pluginHost!,
              'main',
            )
            if (!titleInfo) return

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
        overlayCtx.fillText(pctText, x, y + 1)
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
