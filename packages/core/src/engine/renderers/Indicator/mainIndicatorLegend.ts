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
            // 指标名称
            overlayCtx.fillStyle = colors.text.primary
            overlayCtx.fillText(titleInfo.name, x, y)
            x += measureTextWidth(overlayCtx, titleInfo.name)

            // 指标参数
            if (titleInfo.params && titleInfo.params.length > 0) {
              const paramText = `(${titleInfo.params.join(',')})`
              overlayCtx.fillStyle = colors.text.tertiary
              overlayCtx.fillText(paramText, x, y)
              x += measureTextWidth(overlayCtx, paramText) + gap
            } else {
              x += gap
            }

            // 指标数值
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
