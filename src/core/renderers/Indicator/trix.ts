import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { TRIXRenderState } from '@/core/indicators/trixState'
import { createTRIXStateKey } from '@/core/indicators/trixState'

const TRIX_COLOR = '#e11d48'
const SIGNAL_COLOR = '#f59e0b'

type Point = { x: number; y: number }

export interface TRIXRendererOptions { paneId?: string }

export function createTRIXRendererPlugin(options: TRIXRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub_TRIX' } = options
    const STATE_KEY = createTRIXStateKey(paneId)
    let pluginHost: PluginHost | null = null

    return {
        name: `trix_${paneId}`,
        version: '1.0.0',
        description: 'TRIX 三重指数平滑振荡器渲染器',
        debugName: 'TRIX',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,

        onInstall(host: PluginHost) { pluginHost = host },
        getDeclaredNamespaces() { return [STATE_KEY] },

        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters } = context
            const state = pluginHost?.getSharedState<TRIXRenderState>(STATE_KEY)
            if (!state || state.visibleMin > state.visibleMax) return
            const { showTRIX, showSignal } = state.params
            if (!showTRIX && !showSignal) return

            const { valueMin, valueMax, series, signalSeries } = state
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayValueRange = (displayRange.maxPrice - displayMin) || 1
            const toY = (v: number) => pane.height - (v - displayMin) / displayValueRange * pane.height

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            // Zero line
            const zeroY = toY(0)
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
            ctx.lineWidth = 1
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            ctx.moveTo(scrollLeft, zeroY)
            ctx.lineTo(scrollLeft + context.paneWidth, zeroY)
            ctx.stroke()
            ctx.setLineDash([])
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'

            const trixPts: Point[] = []
            const sigPts: Point[] = []
            const drawEnd = Math.min(range.end, series.length)
            for (let i = range.start; i < drawEnd; i++) {
                const centerX = kLineCenters[i - range.start]
                if (centerX === undefined) continue
                if (showTRIX) {
                    const v = series[i]
                    if (v !== undefined) trixPts.push({ x: centerX, y: toY(v) })
                }
                if (showSignal) {
                    const s = signalSeries[i]
                    if (s !== undefined) sigPts.push({ x: centerX, y: toY(s) })
                }
            }

            drawLine(ctx, trixPts, TRIX_COLOR)
            drawLine(ctx, sigPts, SIGNAL_COLOR)
            ctx.restore()
        },

        getConfig() {
            const state = pluginHost?.getSharedState<TRIXRenderState>(STATE_KEY)
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
