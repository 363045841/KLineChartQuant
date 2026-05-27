import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { FibRenderState } from '@/core/indicators/fibState'
import { createFibStateKey } from '@/core/indicators/fibState'

const FIB_COLORS = {
    high: '#94a3b8',
    low: '#94a3b8',
    l236: '#fbbf24',
    l382: '#f59e0b',
    l500: '#d97706',
    l618: '#dc2626',
    l786: '#7c2d12',
}

type Point = { x: number; y: number }

export function createFibRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
    const { paneId = 'sub_Fib' } = options
    const STATE_KEY = createFibStateKey(paneId)
    let pluginHost: PluginHost | null = null
    return {
        name: `fib_${paneId}`,
        version: '1.0.0',
        description: '斐波那契回撤线渲染器（滚动窗口锚点）',
        debugName: 'Fib',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,
        onInstall(host) { pluginHost = host },
        getDeclaredNamespaces() { return [STATE_KEY] },
        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters } = context
            const state = pluginHost?.getSharedState<FibRenderState>(STATE_KEY)
            if (!state || !state.params.showLevels || state.visibleMin > state.visibleMax) return

            const { valueMin, valueMax, series } = state
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayValueRange = (displayRange.maxPrice - displayMin) || 1
            const toY = (v: number) => pane.height - (v - displayMin) / displayValueRange * pane.height

            const collectors: Record<string, Point[]> = { high: [], low: [], l236: [], l382: [], l500: [], l618: [], l786: [] }
            const drawEnd = Math.min(range.end, series.length)
            for (let i = range.start; i < drawEnd; i++) {
                const pt = series[i]
                if (!pt) continue
                const centerX = kLineCenters[i - range.start]
                if (centerX === undefined) continue
                collectors.high!.push({ x: centerX, y: toY(pt.high) })
                collectors.low!.push({ x: centerX, y: toY(pt.low) })
                collectors.l236!.push({ x: centerX, y: toY(pt.level236) })
                collectors.l382!.push({ x: centerX, y: toY(pt.level382) })
                collectors.l500!.push({ x: centerX, y: toY(pt.level500) })
                collectors.l618!.push({ x: centerX, y: toY(pt.level618) })
                collectors.l786!.push({ x: centerX, y: toY(pt.level786) })
            }

            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.lineWidth = 1
            for (const [key, pts] of Object.entries(collectors)) {
                drawLine(ctx, pts, FIB_COLORS[key as keyof typeof FIB_COLORS])
            }
            ctx.restore()
        },
        getConfig() { return pluginHost?.getSharedState<FibRenderState>(STATE_KEY)?.params ?? {} },
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
