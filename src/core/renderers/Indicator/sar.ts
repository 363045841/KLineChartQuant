import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { SARRenderState } from '@/core/indicators/sarState'
import { createSARStateKey } from '@/core/indicators/sarState'

const SAR_UP_COLOR = '#22c55e'
const SAR_DOWN_COLOR = '#ef4444'
const DOT_RADIUS = 1.5
const TAU = Math.PI * 2

export interface SARRendererOptions {
    paneId?: string
}

export function createSARRendererPlugin(options: SARRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub_SAR' } = options
    const STATE_KEY = createSARStateKey(paneId)
    let pluginHost: PluginHost | null = null

    return {
        name: `sar_${paneId}`,
        version: '1.0.0',
        description: 'Parabolic SAR 渲染器（绿色 = 多头止损 / 红色 = 空头止损）',
        debugName: 'SAR',
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

            const state = pluginHost?.getSharedState<SARRenderState>(STATE_KEY)
            if (!state || !state.params.showSAR || state.visibleMin > state.visibleMax) return

            const { valueMin, valueMax, series } = state
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayValueRange = (displayRange.maxPrice - displayMin) || 1

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            const drawEnd = Math.min(range.end, series.length)
            for (let i = range.start; i < drawEnd; i++) {
                const point = series[i]
                if (point === undefined) continue
                const centerX = kLineCenters[i - range.start]
                if (centerX === undefined) continue
                const y = pane.height - (point.value - displayMin) / displayValueRange * pane.height
                ctx.fillStyle = point.trend === 'up' ? SAR_UP_COLOR : SAR_DOWN_COLOR
                ctx.beginPath()
                ctx.arc(centerX, y, DOT_RADIUS, 0, TAU)
                ctx.fill()
            }

            ctx.restore()
        },

        getConfig() {
            const state = pluginHost?.getSharedState<SARRenderState>(STATE_KEY)
            return state?.params ?? {}
        },

        setConfig() {
            // no-op
        },
    }
}
