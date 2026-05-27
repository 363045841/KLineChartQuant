import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { IchimokuRenderState } from '@/core/indicators/ichimokuState'
import { createIchimokuStateKey } from '@/core/indicators/ichimokuState'

const TENKAN_COLOR = '#dc2626'
const KIJUN_COLOR = '#2563eb'
const SPAN_A_COLOR = '#16a34a'
const SPAN_B_COLOR = '#dc2626'
const CHIKOU_COLOR = '#7c3aed'
const CLOUD_BULL = 'rgba(34, 197, 94, 0.15)'
const CLOUD_BEAR = 'rgba(239, 68, 68, 0.15)'

type Point = { x: number; y: number }

export interface IchimokuRendererOptions {
    paneId?: string
}

export function createIchimokuRendererPlugin(options: IchimokuRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub_Ichimoku' } = options
    const STATE_KEY = createIchimokuStateKey(paneId)
    let pluginHost: PluginHost | null = null

    return {
        name: `ichimoku_${paneId}`,
        version: '1.0.0',
        description: '一目均衡表渲染器（转换线/基准线/先行带 A·B/迟行线 + 云图填充）',
        debugName: 'Ichimoku',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,

        onInstall(host: PluginHost) { pluginHost = host },
        getDeclaredNamespaces() { return [STATE_KEY] },

        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters } = context
            const state = pluginHost?.getSharedState<IchimokuRenderState>(STATE_KEY)
            if (!state || state.visibleMin > state.visibleMax) return
            const { params, series, valueMin, valueMax } = state

            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayValueRange = (displayRange.maxPrice - displayMin) || 1
            const toY = (price: number) => pane.height - (price - displayMin) / displayValueRange * pane.height

            const tenkanPts: Point[] = []
            const kijunPts: Point[] = []
            const spanAPts: Point[] = []
            const spanBPts: Point[] = []
            const chikouPts: Point[] = []
            // For cloud fill: collect aligned (x, spanA, spanB) tuples
            const cloudSegs: { x: number; ya: number; yb: number; bull: boolean }[] = []

            const drawEnd = Math.min(range.end, series.length)
            for (let i = range.start; i < drawEnd; i++) {
                const p = series[i]
                if (!p) continue
                const centerX = kLineCenters[i - range.start]
                if (centerX === undefined) continue
                if (params.showTenkan && p.tenkan !== undefined) tenkanPts.push({ x: centerX, y: toY(p.tenkan) })
                if (params.showKijun && p.kijun !== undefined) kijunPts.push({ x: centerX, y: toY(p.kijun) })
                if (params.showSpanA && p.spanA !== undefined) spanAPts.push({ x: centerX, y: toY(p.spanA) })
                if (params.showSpanB && p.spanB !== undefined) spanBPts.push({ x: centerX, y: toY(p.spanB) })
                if (params.showChikou && p.chikou !== undefined) chikouPts.push({ x: centerX, y: toY(p.chikou) })
                if (params.showCloud && p.spanA !== undefined && p.spanB !== undefined) {
                    cloudSegs.push({ x: centerX, ya: toY(p.spanA), yb: toY(p.spanB), bull: p.spanA > p.spanB })
                }
            }

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            // Cloud first (background)
            if (params.showCloud && cloudSegs.length >= 2) {
                fillCloud(ctx, cloudSegs)
            }

            ctx.lineWidth = 1
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'
            drawLine(ctx, tenkanPts, TENKAN_COLOR)
            drawLine(ctx, kijunPts, KIJUN_COLOR)
            drawLine(ctx, spanAPts, SPAN_A_COLOR)
            drawLine(ctx, spanBPts, SPAN_B_COLOR)
            drawLine(ctx, chikouPts, CHIKOU_COLOR)
            ctx.restore()
        },

        getConfig() {
            const state = pluginHost?.getSharedState<IchimokuRenderState>(STATE_KEY)
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

function fillCloud(
    ctx: CanvasRenderingContext2D,
    segs: { x: number; ya: number; yb: number; bull: boolean }[],
): void {
    // 简化策略：按相邻 bar 之间的状态绘制小四边形。状态翻转处分段。
    let i = 0
    while (i < segs.length - 1) {
        const startBull = segs[i]!.bull
        let j = i + 1
        while (j < segs.length && segs[j]!.bull === startBull) j++
        if (j - i >= 2) {
            ctx.fillStyle = startBull ? CLOUD_BULL : CLOUD_BEAR
            ctx.beginPath()
            ctx.moveTo(segs[i]!.x, segs[i]!.ya)
            for (let k = i + 1; k < j; k++) ctx.lineTo(segs[k]!.x, segs[k]!.ya)
            for (let k = j - 1; k >= i; k--) ctx.lineTo(segs[k]!.x, segs[k]!.yb)
            ctx.closePath()
            ctx.fill()
        }
        i = j
    }
}
