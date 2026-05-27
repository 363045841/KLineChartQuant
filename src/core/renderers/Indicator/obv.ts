import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { OBVRenderState } from '@/core/indicators/obvState'
import { createOBVStateKey } from '@/core/indicators/obvState'

const OBV_COLOR = '#16a34a'

export function createOBVRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
    const { paneId = 'sub_OBV' } = options
    const STATE_KEY = createOBVStateKey(paneId)
    let pluginHost: PluginHost | null = null
    return {
        name: `obv_${paneId}`,
        version: '1.0.0',
        description: 'OBV 能量潮渲染器',
        debugName: 'OBV',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,
        onInstall(host) { pluginHost = host },
        getDeclaredNamespaces() { return [STATE_KEY] },
        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters } = context
            const state = pluginHost?.getSharedState<OBVRenderState>(STATE_KEY)
            if (!state || !state.params.showOBV || state.visibleMin > state.visibleMax) return
            const { valueMin, valueMax, series } = state
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayValueRange = (displayRange.maxPrice - displayMin) || 1
            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.strokeStyle = OBV_COLOR
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
                if (!started) { ctx.beginPath(); ctx.moveTo(centerX, y); started = true } else ctx.lineTo(centerX, y)
            }
            if (started) ctx.stroke()
            ctx.restore()
        },
        getConfig() { return pluginHost?.getSharedState<OBVRenderState>(STATE_KEY)?.params ?? {} },
        setConfig() {},
    }
}
