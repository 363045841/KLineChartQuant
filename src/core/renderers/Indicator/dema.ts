import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { DEMARenderState } from '@/core/indicators/demaState'
import { createDEMAStateKey } from '@/core/indicators/demaState'

const DEMA_COLOR = '#6366f1'

export interface DEMARendererOptions {
    paneId?: string
}

export function createDEMARendererPlugin(options: DEMARendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub_DEMA' } = options
    const STATE_KEY = createDEMAStateKey(paneId)
    let pluginHost: PluginHost | null = null

    return {
        name: `dema_${paneId}`,
        version: '1.0.0',
        description: 'DEMA 双重指数移动均线渲染器',
        debugName: 'DEMA',
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

            const state = pluginHost?.getSharedState<DEMARenderState>(STATE_KEY)
            if (!state || !state.params.showDEMA || state.visibleMin > state.visibleMax) return

            const { valueMin, valueMax, series } = state
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayValueRange = (displayRange.maxPrice - displayMin) || 1

            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.strokeStyle = DEMA_COLOR
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
            const state = pluginHost?.getSharedState<DEMARenderState>(STATE_KEY)
            return state?.params ?? {}
        },

        setConfig() {
            // no-op
        },
    }
}
