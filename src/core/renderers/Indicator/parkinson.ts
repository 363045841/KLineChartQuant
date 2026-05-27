import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { ParkinsonRenderState } from '@/core/indicators/parkinsonState'
import { createParkinsonStateKey } from '@/core/indicators/parkinsonState'

const PARKINSON_COLOR = '#0891b2'

export function createParkinsonRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
    const { paneId = 'sub_Parkinson' } = options
    const STATE_KEY = createParkinsonStateKey(paneId)
    let pluginHost: PluginHost | null = null
    return {
        name: `parkinson_${paneId}`,
        version: '1.0.0',
        description: 'Parkinson 波动率（高低价范围）渲染器',
        debugName: 'Parkinson',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,
        onInstall(host) { pluginHost = host },
        getDeclaredNamespaces() { return [STATE_KEY] },
        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters } = context
            const state = pluginHost?.getSharedState<ParkinsonRenderState>(STATE_KEY)
            if (!state || !state.params.showParkinson || state.visibleMin > state.visibleMax) return
            const { valueMin, valueMax, series } = state
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayValueRange = (displayRange.maxPrice - displayMin) || 1
            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.strokeStyle = PARKINSON_COLOR
            ctx.lineWidth = 1.5
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
                if (!started) { ctx.beginPath(); ctx.moveTo(centerX, y); started = true }
                else ctx.lineTo(centerX, y)
            }
            if (started) ctx.stroke()
            ctx.restore()
        },
        getConfig() {
            const state = pluginHost?.getSharedState<ParkinsonRenderState>(STATE_KEY)
            return state?.params ?? {}
        },
        setConfig() {},
    }
}
