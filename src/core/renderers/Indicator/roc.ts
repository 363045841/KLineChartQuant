import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { ROCRenderState } from '@/core/indicators/rocState'
import { createROCStateKey } from '@/core/indicators/rocState'

const ROC_COLOR = '#0ea5e9'

export interface ROCRendererOptions { paneId?: string }

export function createROCRendererPlugin(options: ROCRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub_ROC' } = options
    const STATE_KEY = createROCStateKey(paneId)
    let pluginHost: PluginHost | null = null

    return {
        name: `roc_${paneId}`,
        version: '1.0.0',
        description: 'ROC 变化率渲染器',
        debugName: 'ROC',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,

        onInstall(host: PluginHost) { pluginHost = host },
        getDeclaredNamespaces() { return [STATE_KEY] },

        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters } = context
            const state = pluginHost?.getSharedState<ROCRenderState>(STATE_KEY)
            if (!state || !state.params.showROC || state.visibleMin > state.visibleMax) return

            const { valueMin, valueMax, series } = state
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayValueRange = (displayRange.maxPrice - displayMin) || 1

            ctx.save()
            ctx.translate(-scrollLeft, 0)
            // Zero line
            const zeroY = pane.height - (0 - displayMin) / displayValueRange * pane.height
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
            ctx.lineWidth = 1
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            ctx.moveTo(scrollLeft, zeroY)
            ctx.lineTo(scrollLeft + context.paneWidth, zeroY)
            ctx.stroke()
            ctx.setLineDash([])

            ctx.strokeStyle = ROC_COLOR
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
            const state = pluginHost?.getSharedState<ROCRenderState>(STATE_KEY)
            return state?.params ?? {}
        },
        setConfig() {},
    }
}
