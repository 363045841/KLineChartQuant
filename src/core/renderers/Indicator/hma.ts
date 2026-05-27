import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { HMARenderState } from '@/core/indicators/hmaState'
import { createHMAStateKey } from '@/core/indicators/hmaState'

const HMA_COLOR = '#f43f5e'

export interface HMARendererOptions {
    paneId?: string
}

export function createHMARendererPlugin(options: HMARendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub_HMA' } = options
    const STATE_KEY = createHMAStateKey(paneId)
    let pluginHost: PluginHost | null = null

    return {
        name: `hma_${paneId}`,
        version: '1.0.0',
        description: 'HMA Hull 移动均线渲染器',
        debugName: 'HMA',
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

            const state = pluginHost?.getSharedState<HMARenderState>(STATE_KEY)
            if (!state || !state.params.showHMA || state.visibleMin > state.visibleMax) return

            const { valueMin, valueMax, series } = state
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayValueRange = (displayRange.maxPrice - displayMin) || 1

            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.strokeStyle = HMA_COLOR
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
            const state = pluginHost?.getSharedState<HMARenderState>(STATE_KEY)
            return state?.params ?? {}
        },

        setConfig() {
            // no-op
        },
    }
}
