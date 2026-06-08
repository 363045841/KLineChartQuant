import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { PivotRenderState } from '../../indicators/pivotState'
import { createPivotStateKey, EMPTY_PIVOT_STATE } from '../../indicators/pivotState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, PivotSchedulerConfig } from '../../indicators/scheduler'
import { createExactRangePointVisibleStateComposer } from '../../indicators/visibleStateComposers'

const PP_COLOR = '#94a3b8'
const R_COLOR = '#dc2626'
const S_COLOR = '#16a34a'

type Point = { x: number; y: number }

function getPivotStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn('[PivotRenderer] Scheduler not available via service locator')
        return null
    }
    const meta = scheduler.getIndicatorMetadata('pivot')
    if (!meta) {
        console.warn('[PivotRenderer] Indicator metadata for \'pivot\' not found, skip rendering')
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createPivotRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
    const { paneId = 'main' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getPivotStateKey(pluginHost, paneId)
    }

    return {
        name: `pivot_${paneId}`,
        version: '1.0.0',
        description: 'Pivot Points 枢轴点渲染器（PP/R1-3/S1-3 阶梯线）',
        debugName: 'Pivot',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,
        onInstall(host) { pluginHost = host },
        getDeclaredNamespaces() {
            const key = resolveKey()
            return key ? [key] : []
        },
        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters } = context
            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<PivotRenderState>(stateKey)
            if (!state || state.visibleMin > state.visibleMax) return
            const p = state.params
            if (!(p.showPP || p.showR1 || p.showR2 || p.showR3 || p.showS1 || p.showS2 || p.showS3)) return

            const { series } = state
            const toY = (v: number) => pane.yAxis.priceToY(v)

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
        getConfig() {
            const stateKey = resolveKey()
            if (!stateKey) return {}
            return pluginHost?.getSharedState<PivotRenderState>(stateKey)?.params ?? {}
        },
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

@Indicator({
    name: 'pivot',
    displayName: 'Pivot',
    category: 'main',
    stateKey: createPivotStateKey,
    defaultPaneId: 'main',
    paneIdField: 'pivotPaneId',
    allowMainPane: true,
    mainPane: { rendererName: 'pivot_main', toActiveConfig: (params, active) => ({ ...params, showPP: active, showR1: active, showR2: active, showR3: active, showS1: active, showS2: active, showS3: active }) },
    scale: { indicatorKey: 'pivot', label: 'Pivot', decimals: 2 },
    visibleState: { compose: createExactRangePointVisibleStateComposer('pivot', EMPTY_PIVOT_STATE, ['pp', 'r1', 'r2', 'r3', 's1', 's2', 's3']) },
    updateConfig: (scheduler, params, paneId) => {
        (scheduler as IndicatorScheduler).updatePivotConfig(params as Partial<PivotSchedulerConfig>, paneId)
    },
    applyResult: (host, state, paneId) => {
        host.setSharedState(createPivotStateKey(paneId), state as any, 'indicator_scheduler')
    },
})
class PivotDefinition {
    static rendererFactory = createPivotRendererPlugin
}
