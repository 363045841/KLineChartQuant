import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { WMARenderState } from '@/core/indicators/wmaState'
import { createWMAStateKey } from '@/core/indicators/wmaState'

const WMA_COLOR = '#10b981'

export interface WMARendererOptions {
    paneId?: string
}

export function createWMARendererPlugin(options: WMARendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub_WMA' } = options
    const STATE_KEY = createWMAStateKey(paneId)
    let pluginHost: PluginHost | null = null

    return {
        name: `wma_${paneId}`,
        version: '1.0.0',
        description: 'WMA 线性加权移动均线渲染器',
        debugName: 'WMA',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,

        onInstall(host: PluginHost) {
            pluginHost = host
        },

        getDeclaredNamespaces() {
            return [STATE_KEY]
        },

        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters } = context

            const state = pluginHost?.getSharedState<WMARenderState>(STATE_KEY)
            if (!state || !state.params.showWMA || state.visibleMin > state.visibleMax) return

            const { valueMin, valueMax, series } = state
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayValueRange = (displayRange.maxPrice - displayMin) || 1

            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.strokeStyle = WMA_COLOR
            ctx.lineWidth = 1
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'

            const drawEnd = Math.min(range.end, series.length)
            let started = false
            for (let i = range.start; i < drawEnd; i++) {
                const value = series[i]
                if (value === undefined) continue
                const centerX = kLineCenters[i - range.start]
                if (centerX === undefined) continue
                const y = pane.height - (value - displayMin) / displayValueRange * pane.height
                if (!started) {
                    ctx.beginPath()
                    ctx.moveTo(centerX, y)
                    started = true
                } else {
                    ctx.lineTo(centerX, y)
                }
            }
            if (started) ctx.stroke()
            ctx.restore()
        },

        getConfig() {
            const state = pluginHost?.getSharedState<WMARenderState>(STATE_KEY)
            return state?.params ?? {}
        },

        setConfig() {
            // no-op
        },
    }
}
