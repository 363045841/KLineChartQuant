import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { ChaikinVolRenderState } from '@/core/indicators/chaikinVolState'
import { createChaikinVolStateKey } from '@/core/indicators/chaikinVolState'

const CHAIKIN_VOL_COLOR = '#f59e0b'

export function createChaikinVolRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
    const { paneId = 'sub_ChaikinVol' } = options
    const STATE_KEY = createChaikinVolStateKey(paneId)
    let pluginHost: PluginHost | null = null
    return {
        name: `chaikinVol_${paneId}`,
        version: '1.0.0',
        description: 'Chaikin Volatility 渲染器（EMA(H-L) 的 ROC）',
        debugName: 'ChaikinVol',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,
        onInstall(host) { pluginHost = host },
        getDeclaredNamespaces() { return [STATE_KEY] },
        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters } = context
            const state = pluginHost?.getSharedState<ChaikinVolRenderState>(STATE_KEY)
            if (!state || !state.params.showChaikinVol || state.visibleMin > state.visibleMax) return
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
            ctx.strokeStyle = CHAIKIN_VOL_COLOR
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
            const state = pluginHost?.getSharedState<ChaikinVolRenderState>(STATE_KEY)
            return state?.params ?? {}
        },
        setConfig() {},
    }
}
