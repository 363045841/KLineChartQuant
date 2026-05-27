import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { MFIRenderState } from '@/core/indicators/mfiState'
import { createMFIStateKey } from '@/core/indicators/mfiState'

const MFI_COLOR = '#fb923c'

export function createMFIRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
    const { paneId = 'sub_MFI' } = options
    const STATE_KEY = createMFIStateKey(paneId)
    let pluginHost: PluginHost | null = null
    return {
        name: `mfi_${paneId}`,
        version: '1.0.0',
        description: 'MFI 资金流强弱渲染器（带 80/20 超买超卖线）',
        debugName: 'MFI',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,
        onInstall(host) { pluginHost = host },
        getDeclaredNamespaces() { return [STATE_KEY] },
        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters } = context
            const state = pluginHost?.getSharedState<MFIRenderState>(STATE_KEY)
            if (!state || !state.params.showMFI || state.visibleMin > state.visibleMax) return
            const { valueMin, valueMax, series } = state
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayValueRange = (displayRange.maxPrice - displayMin) || 1
            const toY = (v: number) => pane.height - (v - displayMin) / displayValueRange * pane.height
            ctx.save()
            ctx.translate(-scrollLeft, 0)
            // 80 / 20 reference lines
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)'
            ctx.lineWidth = 1
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            ctx.moveTo(scrollLeft, toY(80))
            ctx.lineTo(scrollLeft + context.paneWidth, toY(80))
            ctx.stroke()
            ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)'
            ctx.beginPath()
            ctx.moveTo(scrollLeft, toY(20))
            ctx.lineTo(scrollLeft + context.paneWidth, toY(20))
            ctx.stroke()
            ctx.setLineDash([])
            ctx.strokeStyle = MFI_COLOR
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'
            const drawEnd = Math.min(range.end, series.length)
            let started = false
            for (let i = range.start; i < drawEnd; i++) {
                const value = series[i]
                if (value === undefined) continue
                const centerX = kLineCenters[i - range.start]
                if (centerX === undefined) continue
                const y = toY(value)
                if (!started) { ctx.beginPath(); ctx.moveTo(centerX, y); started = true } else ctx.lineTo(centerX, y)
            }
            if (started) ctx.stroke()
            ctx.restore()
        },
        getConfig() { return pluginHost?.getSharedState<MFIRenderState>(STATE_KEY)?.params ?? {} },
        setConfig() {},
    }
}
