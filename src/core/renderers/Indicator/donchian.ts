import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { DonchianRenderState } from '@/core/indicators/donchianState'
import { createDonchianStateKey } from '@/core/indicators/donchianState'

const DONCHIAN_UPPER_COLOR = '#0891b2'
const DONCHIAN_MIDDLE_COLOR = '#94a3b8'
const DONCHIAN_LOWER_COLOR = '#0891b2'

type Point = { x: number; y: number }

export interface DonchianRendererOptions { paneId?: string }

export function createDonchianRendererPlugin(options: DonchianRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub_Donchian' } = options
    const STATE_KEY = createDonchianStateKey(paneId)
    let pluginHost: PluginHost | null = null

    return {
        name: `donchian_${paneId}`,
        version: '1.0.0',
        description: 'Donchian Channel 渲染器（rolling max/min）',
        debugName: 'Donchian',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,

        onInstall(host: PluginHost) { pluginHost = host },
        getDeclaredNamespaces() { return [STATE_KEY] },

        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters } = context
            const state = pluginHost?.getSharedState<DonchianRenderState>(STATE_KEY)
            if (!state || state.visibleMin > state.visibleMax) return
            const { showUpper, showMiddle, showLower } = state.params
            if (!showUpper && !showMiddle && !showLower) return

            const { valueMin, valueMax, series } = state
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayValueRange = (displayRange.maxPrice - displayMin) || 1

            const upperPts: Point[] = []
            const middlePts: Point[] = []
            const lowerPts: Point[] = []
            const drawEnd = Math.min(range.end, series.length)
            for (let i = range.start; i < drawEnd; i++) {
                const point = series[i]
                if (!point) continue
                const centerX = kLineCenters[i - range.start]
                if (centerX === undefined) continue
                if (showUpper) upperPts.push({ x: centerX, y: pane.height - (point.upper - displayMin) / displayValueRange * pane.height })
                if (showMiddle) middlePts.push({ x: centerX, y: pane.height - (point.middle - displayMin) / displayValueRange * pane.height })
                if (showLower) lowerPts.push({ x: centerX, y: pane.height - (point.lower - displayMin) / displayValueRange * pane.height })
            }

            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.lineWidth = 1
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'
            drawLine(ctx, upperPts, DONCHIAN_UPPER_COLOR)
            drawLine(ctx, middlePts, DONCHIAN_MIDDLE_COLOR)
            drawLine(ctx, lowerPts, DONCHIAN_LOWER_COLOR)
            ctx.restore()
        },

        getConfig() {
            const state = pluginHost?.getSharedState<DonchianRenderState>(STATE_KEY)
            return state?.params ?? {}
        },
        setConfig() {},
    }
}

function drawLine(ctx: CanvasRenderingContext2D, pts: Point[], color: string): void {
    if (pts.length < 2) return
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.moveTo(pts[0]!.x, pts[0]!.y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y)
    ctx.stroke()
}
