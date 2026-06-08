import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { FibRenderState } from '../../indicators/fibState'
import { createFibStateKey, EMPTY_FIB_STATE } from '../../indicators/fibState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, FibSchedulerConfig } from '../../indicators/scheduler'
import { createExactRangePointVisibleStateComposer } from '../../indicators/visibleStateComposers'

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

function getFibStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn('[FibRenderer] Scheduler not available via service locator')
        return null
    }
    const meta = scheduler.getIndicatorMetadata('fib')
    if (!meta) {
        console.warn('[FibRenderer] Indicator metadata for \'fib\' not found, skip rendering')
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createFibRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
    const { paneId = 'main' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getFibStateKey(pluginHost, paneId)
    }

    return {
        name: `fib_${paneId}`,
        version: '1.1.0',
        description: '斐波那契回撤线渲染器（WebGL + Canvas2D 回退）',
        debugName: 'Fib',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,
        onInstall(host) { pluginHost = host },
        getDeclaredNamespaces() {
            const key = resolveKey()
            return key ? [key] : []
        },
        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters, lineWebGLSurface } = context
            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<FibRenderState>(stateKey)
            if (!state || !state.params.showLevels || state.visibleMin > state.visibleMax) return

            const { series } = state
            const toY = (v: number) => pane.yAxis.priceToY(v)
            const rangeStart = range.start

            const collectors: Record<string, Point[]> = { high: [], low: [], l236: [], l382: [], l500: [], l618: [], l786: [] }
            const drawEnd = Math.min(range.end, series.length)
            for (let i = range.start; i < drawEnd; i++) {
                const pt = series[i]
                if (!pt) continue
                const centerX = kLineCenters[i - rangeStart]
                if (centerX === undefined) continue
                collectors.high!.push({ x: centerX, y: toY(pt.high) })
                collectors.low!.push({ x: centerX, y: toY(pt.low) })
                collectors.l236!.push({ x: centerX, y: toY(pt.level236) })
                collectors.l382!.push({ x: centerX, y: toY(pt.level382) })
                collectors.l500!.push({ x: centerX, y: toY(pt.level500) })
                collectors.l618!.push({ x: centerX, y: toY(pt.level618) })
                collectors.l786!.push({ x: centerX, y: toY(pt.level786) })
            }

            const lines: Array<{ points: Point[]; width: number; color: string }> = []
            for (const [key, pts] of Object.entries(collectors)) {
                if (pts.length >= 2) {
                    lines.push({ points: pts, width: 1, color: FIB_COLORS[key as keyof typeof FIB_COLORS] })
                }
            }

            const enableWebGL = context.settings?.enableWebGLRendering !== false
            let usedWebGL = false
            if (enableWebGL && lineWebGLSurface?.isAvailable()) {
                const allOk = lines.length > 0 && lineWebGLSurface.drawLineStrips(lines, scrollLeft)
                if (allOk) {
                    usedWebGL = true
                    lineWebGLSurface.compositeTo(ctx, { imageSmoothingEnabled: false })
                }
            }

            if (usedWebGL) return

            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.lineWidth = 1
            for (const [key, pts] of Object.entries(collectors)) {
                drawLine(ctx, pts, FIB_COLORS[key as keyof typeof FIB_COLORS])
            }
            ctx.restore()
        },
        getConfig() {
            const stateKey = resolveKey()
            if (!stateKey) return {}
            return pluginHost?.getSharedState<FibRenderState>(stateKey)?.params ?? {}
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

@Indicator({
    name: 'fib',
    displayName: 'Fib',
    category: 'main',
    stateKey: createFibStateKey,
    defaultPaneId: 'main',
    paneIdField: 'fibPaneId',
    allowMainPane: true,
    mainPane: { rendererName: 'fib_main', toActiveConfig: (params, active) => ({ ...params, showLevels: active }) },
    scale: { indicatorKey: 'fib', label: 'Fib', decimals: 4 },
    visibleState: { compose: createExactRangePointVisibleStateComposer('fib', EMPTY_FIB_STATE, ['low', 'high']) },
    updateConfig: (scheduler, params, paneId) => {
        (scheduler as IndicatorScheduler).updateFibConfig(params as Partial<FibSchedulerConfig>, paneId)
    },
    applyResult: (host, state, paneId) => {
        host.setSharedState(createFibStateKey(paneId), state as any, 'indicator_scheduler')
    },
})
class FibDefinition {
    static rendererFactory = createFibRendererPlugin
}
