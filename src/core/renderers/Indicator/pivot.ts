import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { PivotRenderState } from '@/core/indicators/pivotState'
import { createPivotStateKey } from '@/core/indicators/pivotState'

const PP_COLOR = '#94a3b8'
const R_COLOR = '#dc2626'
const S_COLOR = '#16a34a'

type Point = { x: number; y: number }

export function createPivotRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
    const { paneId = 'sub_Pivot' } = options
    const STATE_KEY = createPivotStateKey(paneId)
    let pluginHost: PluginHost | null = null
    return {
        name: `pivot_${paneId}`,
        version: '1.0.0',
        description: 'Pivot Points 枢轴点渲染器（PP/R1-3/S1-3 阶梯线）',
        debugName: 'Pivot',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,
        onInstall(host) { pluginHost = host },
        getDeclaredNamespaces() { return [STATE_KEY] },
        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters } = context
            const state = pluginHost?.getSharedState<PivotRenderState>(STATE_KEY)
            if (!state || state.visibleMin > state.visibleMax) return
            const p = state.params
            if (!(p.showPP || p.showR1 || p.showR2 || p.showR3 || p.showS1 || p.showS2 || p.showS3)) return

            const { valueMin, valueMax, series } = state
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayValueRange = (displayRange.maxPrice - displayMin) || 1
            const toY = (v: number) => pane.height - (v - displayMin) / displayValueRange * pane.height

            const drawEnd = Math.min(range.end, series.length)
            const ppPts: Point[] = []
            const r1Pts: Point[] = []
            const r2Pts: Point[] = []
            const r3Pts: Point[] = []
            const s1Pts: Point[] = []
            const s2Pts: Point[] = []
            const s3Pts: Point[] = []
            for (let i = range.start; i < drawEnd; i++) {
                const pt = series[i]
                if (!pt) continue
                const centerX = kLineCenters[i - range.start]
                if (centerX === undefined) continue
                if (p.showPP) ppPts.push({ x: centerX, y: toY(pt.pp) })
                if (p.showR1) r1Pts.push({ x: centerX, y: toY(pt.r1) })
                if (p.showR2) r2Pts.push({ x: centerX, y: toY(pt.r2) })
                if (p.showR3) r3Pts.push({ x: centerX, y: toY(pt.r3) })
                if (p.showS1) s1Pts.push({ x: centerX, y: toY(pt.s1) })
                if (p.showS2) s2Pts.push({ x: centerX, y: toY(pt.s2) })
                if (p.showS3) s3Pts.push({ x: centerX, y: toY(pt.s3) })
            }

            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.lineWidth = 1
            drawStep(ctx, ppPts, PP_COLOR)
            drawStep(ctx, r1Pts, R_COLOR)
            drawStep(ctx, r2Pts, R_COLOR)
            drawStep(ctx, r3Pts, R_COLOR)
            drawStep(ctx, s1Pts, S_COLOR)
            drawStep(ctx, s2Pts, S_COLOR)
            drawStep(ctx, s3Pts, S_COLOR)
            ctx.restore()
        },
        getConfig() { return pluginHost?.getSharedState<PivotRenderState>(STATE_KEY)?.params ?? {} },
        setConfig() {},
    }
}

function drawStep(ctx: CanvasRenderingContext2D, pts: Point[], color: string): void {
    if (pts.length < 2) return
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.moveTo(pts[0]!.x, pts[0]!.y)
    for (let i = 1; i < pts.length; i++) {
        // Step line — held constant until next bar
        ctx.lineTo(pts[i]!.x, pts[i - 1]!.y)
        ctx.lineTo(pts[i]!.x, pts[i]!.y)
    }
    ctx.stroke()
}
