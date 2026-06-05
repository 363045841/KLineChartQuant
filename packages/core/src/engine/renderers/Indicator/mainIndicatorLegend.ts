import type { RendererPluginWithHost, PluginHost, RenderContext } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { KLineData } from '../../../types/price'
import { MA_STATE_KEY, type MARenderState } from '../../indicators/maState'
import { BOLL_STATE_KEY, type BOLLRenderState } from '../../indicators/bollState'
import { EXPMA_STATE_KEY, type EXPMARenderState } from '../../indicators/expmaState'
import { ENE_STATE_KEY, type ENERenderState } from '../../indicators/eneState'
import { resolveThemeColors } from '../../../tokens'
import { getFont, setCanvasFont } from '../../theme/fonts'

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

/** 指标行数据 */
interface IndicatorRow {
  enabled: boolean
  params: Record<string, unknown>
}

/** 渲染器配置 */
interface MainIndicatorLegendConfig {
  yPaddingPx: number
  indicators: Record<string, IndicatorRow>
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
    indicators: {
      MA: { enabled: true, params: {} },
      BOLL: { enabled: false, params: { period: 20, multiplier: 2 } },
      EXPMA: { enabled: false, params: { fastPeriod: 12, slowPeriod: 50 } },
      ENE: { enabled: false, params: { period: 10, deviation: 11 } },
    },
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
      return [MA_STATE_KEY, BOLL_STATE_KEY, EXPMA_STATE_KEY, ENE_STATE_KEY]
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

      overlayCtx.save()
      setCanvasFont(overlayCtx, getFont(fontSize))
      overlayCtx.textAlign = 'left'

      const targetIndex = crosshairIndex ?? Math.min(range.end - 1, klineData.length - 1)
      const rows: Array<{ draw: (rowIndex: number) => void }> = []

      const maIndicator = config.indicators.MA
      if (maIndicator?.enabled) {
        rows.push({
          draw: (rowIndex: number) => {
            const items: Array<{ label: string; color: string; value?: number }> = []
            const state = pluginHost?.getSharedState<MARenderState>(MA_STATE_KEY)

            if (state && state.visibleMin <= state.visibleMax) {
              for (const period of state.enabledPeriods) {
                const colorKey = `ma${period}` as keyof typeof colors.ma
                const series = state.series[period]
                const value = series?.[targetIndex]

                items.push({
                  label: `MA${period}`,
                  color: colors.ma[colorKey] || colors.ma.ma5,
                  value: value,
                })
              }
            }

            if (items.length > 0) {
              let x = legendX
              const y = config.yPaddingPx / 2 + fontSize + rowIndex * lineHeight

              overlayCtx.fillStyle = colors.text.primary
              overlayCtx.fillText('MA', x, y)
              x += measureTextWidth(overlayCtx, 'MA') + gap

              for (const it of items) {
                const valText = typeof it.value === 'number' ? ` ${it.value.toFixed(2)}` : ''
                const text = `${it.label}${valText}`
                overlayCtx.fillStyle = it.color
                overlayCtx.fillText(text, x, y)
                x += measureTextWidth(overlayCtx, text) + gap
              }
            }
          }
        })
      }

      const bollIndicator = config.indicators.BOLL
      if (bollIndicator?.enabled) {
        rows.push({
          draw: (rowIndex: number) => {
            const bollState = pluginHost?.getSharedState<BOLLRenderState>(BOLL_STATE_KEY)
            const boll = bollState?.series[targetIndex]
            const period = bollState?.params.period ?? 20
            const multiplier = bollState?.params.multiplier ?? 2

            let x = legendX
            const y = config.yPaddingPx / 2 + fontSize + rowIndex * lineHeight
            const titleText = `BOLL(${period},${multiplier})`

            overlayCtx.fillStyle = colors.text.primary
            overlayCtx.fillText(titleText, x, y)
            x += measureTextWidth(overlayCtx, titleText) + gap

            if (boll) {
              const upperText = `上轨:${boll.upper.toFixed(2)}`
              overlayCtx.fillStyle = colors.boll.upper
              overlayCtx.fillText(upperText, x, y)
              x += measureTextWidth(overlayCtx, upperText) + gap

              const middleText = `中轨:${boll.middle.toFixed(2)}`
              overlayCtx.fillStyle = colors.boll.middle
              overlayCtx.fillText(middleText, x, y)
              x += measureTextWidth(overlayCtx, middleText) + gap

              const lowerText = `下轨:${boll.lower.toFixed(2)}`
              overlayCtx.fillStyle = colors.boll.lower
              overlayCtx.fillText(lowerText, x, y)
            }
          }
        })
      }

      const expmaIndicator = config.indicators.EXPMA
      if (expmaIndicator?.enabled) {
        rows.push({
          draw: (rowIndex: number) => {
            const expmaState = pluginHost?.getSharedState<EXPMARenderState>(EXPMA_STATE_KEY)
            const expma = expmaState?.series[targetIndex]
            const fastPeriod = expmaState?.params.fastPeriod ?? 12
            const slowPeriod = expmaState?.params.slowPeriod ?? 50

            let x = legendX
            const y = config.yPaddingPx / 2 + fontSize + rowIndex * lineHeight
            const titleText = `EXPMA(${fastPeriod},${slowPeriod})`

            overlayCtx.fillStyle = colors.text.primary
            overlayCtx.fillText(titleText, x, y)
            x += measureTextWidth(overlayCtx, titleText) + gap

            if (expma) {
              const fastText = `快:${expma.fast.toFixed(2)}`
              overlayCtx.fillStyle = colors.expma.fast
              overlayCtx.fillText(fastText, x, y)
              x += measureTextWidth(overlayCtx, fastText) + gap

              const slowText = `慢:${expma.slow.toFixed(2)}`
              overlayCtx.fillStyle = colors.expma.slow
              overlayCtx.fillText(slowText, x, y)
            }
          }
        })
      }

      const eneIndicator = config.indicators.ENE
      if (eneIndicator?.enabled) {
        rows.push({
          draw: (rowIndex: number) => {
            const eneState = pluginHost?.getSharedState<ENERenderState>(ENE_STATE_KEY)
            const ene = eneState?.series[targetIndex]
            const period = eneState?.params.period ?? 10
            const deviation = eneState?.params.deviation ?? 11

            let x = legendX
            const y = config.yPaddingPx / 2 + fontSize + rowIndex * lineHeight
            const titleText = `ENE(${period},${deviation})`

            overlayCtx.fillStyle = colors.text.primary
            overlayCtx.fillText(titleText, x, y)
            x += measureTextWidth(overlayCtx, titleText) + gap

            if (ene) {
              const upperText = `上轨:${ene.upper.toFixed(2)}`
              overlayCtx.fillStyle = colors.ene.upper
              overlayCtx.fillText(upperText, x, y)
              x += measureTextWidth(overlayCtx, upperText) + gap

              const middleText = `中轨:${ene.middle.toFixed(2)}`
              overlayCtx.fillStyle = colors.ene.middle
              overlayCtx.fillText(middleText, x, y)
              x += measureTextWidth(overlayCtx, middleText) + gap

              const lowerText = `下轨:${ene.lower.toFixed(2)}`
              overlayCtx.fillStyle = colors.ene.lower
              overlayCtx.fillText(lowerText, x, y)
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
        indicators: { ...config.indicators },
      }
    },

    setConfig(newConfig: Record<string, unknown>) {
      if (typeof newConfig.yPaddingPx === 'number') {
        config.yPaddingPx = newConfig.yPaddingPx
      }
      if (newConfig.indicators && typeof newConfig.indicators === 'object') {
        for (const [id, row] of Object.entries(newConfig.indicators) as [string, IndicatorRow][]) {
          if (!config.indicators[id]) {
            config.indicators[id] = { enabled: false, params: {} }
          }
          if (row.enabled !== undefined) {
            config.indicators[id].enabled = row.enabled
          }
          if (row.params) {
            config.indicators[id].params = row.params
          }
        }
      }
    },
  }
}
