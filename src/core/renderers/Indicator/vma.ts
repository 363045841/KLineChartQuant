import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { VMARenderState } from '@/core/indicators/vmaState'
import { createVMAStateKey } from '@/core/indicators/vmaState'

const VMA_COLOR = '#0ea5e9'

export function createVMARendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
    const { paneId = 'sub_VMA' } = options
    const STATE_KEY = createVMAStateKey(paneId)
    let pluginHost: PluginHost | null = null
    return {
        name: `vma_${paneId}`,
        version: '1.0.0',
        description: 'VMA 成交量均线渲染器',
        debugName: 'VMA',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,
        onInstall(host) { pluginHost = host },
        getDeclaredNamespaces() { return [STATE_KEY] },
        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters } = context
            const state = pluginHost?.getSharedState<VMARenderState>(STATE_KEY)
            if (!state || !state.params.showVMA || state.visibleMin > state.visibleMax) return
            const { valueMin, valueMax, series } = state
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayValueRange = (displayRange.maxPrice - displayMin) || 1
            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.strokeStyle = VMA_COLOR
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
        getConfig() { return pluginHost?.getSharedState<VMARenderState>(STATE_KEY)?.params ?? {} },
        setConfig() {},
    }
}
