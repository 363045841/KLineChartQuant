import type { RendererPluginWithHost, PluginHost, RenderContext } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import { resolveThemeColors } from '../../../tokens'
import { getFont, setCanvasFont } from '../../theme/fonts'
import type { MACDRenderState } from '../../indicators/macdState'
import { createMACDStateKey } from '../../indicators/macdState'

const textWidthCache = new Map<string, number>()
const TEXT_WIDTH_CACHE_LIMIT = 256

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

export interface MACDLegendOptions {
    /** Y 轴内边距（与主图保持一致） */
    yPaddingPx?: number
    /** 目标 pane ID（默认 'sub'） */
    paneId?: string
}

/**
 * 创建 MACD 图例渲染器插件
 * 从 StateStore 读取 MACD 状态，不再在 draw 时计算
 */
export function createMACDLegendRendererPlugin(options: MACDLegendOptions = {}): RendererPluginWithHost {
    const yPaddingPx = options.yPaddingPx ?? 0
    const paneId = options.paneId ?? 'sub'

    let fastPeriod = 12
    let slowPeriod = 26
    let signalPeriod = 9

    let pluginHost: PluginHost | null = null
    const stateKey = createMACDStateKey(paneId)

    return {
        name: `macdLegend_${paneId}`,
        version: '2.1.0',
        description: 'MACD 图例渲染器（StateStore 版）',
        debugName: 'MACD 图例',
        paneId,
        priority: RENDERER_PRIORITY.FOREGROUND,

        onInstall(host: PluginHost): void {
            pluginHost = host
        },

        draw(context: RenderContext) {
            const { ctx, range } = context
            const colors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)

            // 从 StateStore 读取 MACD 状态
            const state = pluginHost?.getSharedState<MACDRenderState>(stateKey)
            if (!state || state.visibleMin > state.visibleMax) return

            // 获取最新值
            let macdValue: { dif: number; dea: number; macd: number } | null = null

            // 优先使用 latestValues（scheduler 已计算好）
            if (state.latestValues) {
                macdValue = state.latestValues
            } else {
                // 回退：从 series 读取最后一个可见点
                const lastIndex = Math.min(range.end - 1, state.series.length - 1)
                const point = state.series[lastIndex]
                if (point) {
                    macdValue = {
                        dif: point.dif,
                        dea: point.dea,
                        macd: point.macd,
                    }
                }
            }

            if (!macdValue) return

            // 从 state.params 读取当前参数
            const params = state.params
            fastPeriod = params.fastPeriod
            slowPeriod = params.slowPeriod
            signalPeriod = params.signalPeriod

            const fontSize = 11
            const gap = 12
            let x = 12
            const y = yPaddingPx + fontSize

            ctx.save()
            setCanvasFont(ctx, getFont(fontSize))
            ctx.textAlign = 'left'
            ctx.textBaseline = 'top'

            const paramText = `MACD(${fastPeriod},${slowPeriod},${signalPeriod})`
            ctx.fillStyle = colors.text.tertiary
            ctx.fillText(paramText, x, y)
            x += measureTextWidth(ctx, paramText) + gap

            const difText = `DIF:${macdValue.dif.toFixed(2)}`
            ctx.fillStyle = colors.macd.dif
            ctx.fillText(difText, x, y)
            x += measureTextWidth(ctx, difText) + gap

            const deaText = `DEA:${macdValue.dea.toFixed(2)}`
            ctx.fillStyle = colors.macd.dea
            ctx.fillText(deaText, x, y)
            x += measureTextWidth(ctx, deaText) + gap

            const macdText = `MACD:${macdValue.macd.toFixed(2)}`
            ctx.fillStyle = macdValue.macd >= 0 ? colors.macd.barUp : colors.macd.barDown
            ctx.fillText(macdText, x, y)

            ctx.restore()
        },

        getConfig() {
            return {
                fastPeriod,
                slowPeriod,
                signalPeriod,
            }
        },

        setConfig(newConfig: Record<string, unknown>) {
            if (typeof newConfig.fastPeriod === 'number') fastPeriod = newConfig.fastPeriod
            if (typeof newConfig.slowPeriod === 'number') slowPeriod = newConfig.slowPeriod
            if (typeof newConfig.signalPeriod === 'number') signalPeriod = newConfig.signalPeriod
        },
    }
}
