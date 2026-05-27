import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { SuperTrendRenderState } from '@/core/indicators/supertrendState'
import { createSuperTrendStateKey } from '@/core/indicators/supertrendState'

const ST_UP_COLOR = '#22c55e'
const ST_DOWN_COLOR = '#ef4444'

export interface SuperTrendRendererOptions {
    paneId?: string
}

export function createSuperTrendRendererPlugin(options: SuperTrendRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub_SuperTrend' } = options
    const STATE_KEY = createSuperTrendStateKey(paneId)
    let pluginHost: PluginHost | null = null

    return {
        name: `supertrend_${paneId}`,
        version: '1.0.0',
        description: 'SuperTrend ATR 趋势带渲染器（趋势翻转处颜色切换）',
        debugName: 'SuperTrend',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,

        onInstall(host: PluginHost) { pluginHost = host },
        getDeclaredNamespaces() { return [STATE_KEY] },

        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters } = context
            const state = pluginHost?.getSharedState<SuperTrendRenderState>(STATE_KEY)
            if (!state || !state.params.showSuperTrend || state.visibleMin > state.visibleMax) return

            const { valueMin, valueMax, series } = state
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayValueRange = (displayRange.maxPrice - displayMin) || 1

            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.lineWidth = 1.5
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'

            const drawEnd = Math.min(range.end, series.length)
            let prevX: number | null = null
            let prevY: number | null = null
            let prevTrend: 'up' | 'down' | null = null

            for (let i = range.start; i < drawEnd; i++) {
                const point = series[i]
                if (point === undefined) continue
                const centerX = kLineCenters[i - range.start]
                if (centerX === undefined) continue
                const y = pane.height - (point.value - displayMin) / displayValueRange * pane.height

                if (prevX !== null && prevTrend === point.trend) {
                    ctx.strokeStyle = point.trend === 'up' ? ST_UP_COLOR : ST_DOWN_COLOR
                    ctx.beginPath()
                    ctx.moveTo(prevX, prevY!)
                    ctx.lineTo(centerX, y)
                    ctx.stroke()
                }

                prevX = centerX
                prevY = y
                prevTrend = point.trend
            }
            ctx.restore()
        },

        getConfig() {
            const state = pluginHost?.getSharedState<SuperTrendRenderState>(STATE_KEY)
            return state?.params ?? {}
        },
        setConfig() {},
    }
}
