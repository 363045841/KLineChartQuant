import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { CMFRenderState } from '@/core/indicators/cmfState'
import { createCMFStateKey } from '@/core/indicators/cmfState'

const CMF_COLOR = '#06b6d4'

export function createCMFRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
    const { paneId = 'sub_CMF' } = options
    const STATE_KEY = createCMFStateKey(paneId)
    let pluginHost: PluginHost | null = null
    return {
        name: `cmf_${paneId}`,
        version: '1.0.0',
        description: 'CMF Chaikin 资金流渲染器',
        debugName: 'CMF',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,
        onInstall(host) { pluginHost = host },
        getDeclaredNamespaces() { return [STATE_KEY] },
        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters } = context
            const state = pluginHost?.getSharedState<CMFRenderState>(STATE_KEY)
            if (!state || !state.params.showCMF || state.visibleMin > state.visibleMax) return
            const { valueMin, valueMax, series } = state
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayValueRange = (displayRange.maxPrice - displayMin) || 1
            const zeroY = pane.height - (0 - displayMin) / displayValueRange * pane.height
            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
            ctx.lineWidth = 1
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            ctx.moveTo(scrollLeft, zeroY)
            ctx.lineTo(scrollLeft + context.paneWidth, zeroY)
            ctx.stroke()
            ctx.setLineDash([])
            ctx.strokeStyle = CMF_COLOR
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
        getConfig() { return pluginHost?.getSharedState<CMFRenderState>(STATE_KEY)?.params ?? {} },
        setConfig() {},
    }
}
