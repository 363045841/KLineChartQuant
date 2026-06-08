import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { DonchianRenderState } from '../../indicators/donchianState'
import { createDonchianStateKey, EMPTY_DONCHIAN_STATE } from '../../indicators/donchianState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, DonchianSchedulerConfig } from '../../indicators/scheduler'
import { createBandVisibleStateComposer } from '../../indicators/visibleStateComposers'

const DONCHIAN_UPPER_COLOR = '#0891b2'
const DONCHIAN_MIDDLE_COLOR = '#94a3b8'
const DONCHIAN_LOWER_COLOR = '#0891b2'

type Point = { x: number; y: number }

export interface DonchianRendererOptions { paneId?: string }

function getDonchianStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn('[DonchianRenderer] Scheduler not available via service locator')
        return null
    }
    const meta = scheduler.getIndicatorMetadata('donchian')
    if (!meta) {
        console.warn('[DonchianRenderer] Indicator metadata for \'donchian\' not found, skip rendering')
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createDonchianRendererPlugin(options: DonchianRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'main' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getDonchianStateKey(pluginHost, paneId)
    }

    return {
        name: `donchian_${paneId}`,
        version: '1.1.0',
        description: 'Donchian Channel 渲染器（WebGL + Canvas2D 回退）',
        debugName: 'Donchian',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,

        onInstall(host: PluginHost) { pluginHost = host },
        getDeclaredNamespaces() { const key = resolveKey(); return key ? [key] : [] },

        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters, lineWebGLSurface } = context
            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<DonchianRenderState>(stateKey)
            if (!state || state.visibleMin > state.visibleMax) return
            const { showUpper, showMiddle, showLower } = state.params
            if (!showUpper && !showMiddle && !showLower) return

            const { series } = state
            const toY = (v: number) => pane.yAxis.priceToY(v)
            const rangeStart = range.start

            const upperPts: Point[] = []
            const middlePts: Point[] = []
            const lowerPts: Point[] = []
            const drawEnd = Math.min(range.end, series.length)
            for (let i = range.start; i < drawEnd; i++) {
                const point = series[i]
                if (!point) continue
                const centerX = kLineCenters[i - rangeStart]
                if (centerX === undefined) continue
                if (showUpper) upperPts.push({ x: centerX, y: toY(point.upper) })
                if (showMiddle) middlePts.push({ x: centerX, y: toY(point.middle) })
                if (showLower) lowerPts.push({ x: centerX, y: toY(point.lower) })
            }

            const lines: Array<{ points: Point[]; width: number; color: string }> = []
            if (upperPts.length >= 2) lines.push({ points: upperPts, width: 1, color: DONCHIAN_UPPER_COLOR })
            if (middlePts.length >= 2) lines.push({ points: middlePts, width: 1, color: DONCHIAN_MIDDLE_COLOR })
            if (lowerPts.length >= 2) lines.push({ points: lowerPts, width: 1, color: DONCHIAN_LOWER_COLOR })

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
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'
            drawLine(ctx, upperPts, DONCHIAN_UPPER_COLOR)
            drawLine(ctx, middlePts, DONCHIAN_MIDDLE_COLOR)
            drawLine(ctx, lowerPts, DONCHIAN_LOWER_COLOR)
            ctx.restore()
        },

        getConfig() {
            const stateKey = resolveKey()
            if (!stateKey) return {}
            const state = pluginHost?.getSharedState<DonchianRenderState>(stateKey)
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

@Indicator({
    name: 'donchian',
    displayName: 'Donchian',
    category: 'main',
    stateKey: createDonchianStateKey,
    defaultPaneId: 'main',
    paneIdField: 'donchianPaneId',
    allowMainPane: true,
    mainPane: { rendererName: 'donchian_main', toActiveConfig: (params, active) => ({ ...params, showUpper: active, showMiddle: active, showLower: active }) },
    scale: { indicatorKey: 'donchian', label: 'Donchian', decimals: 2 },
    visibleState: { compose: createBandVisibleStateComposer('donchian', EMPTY_DONCHIAN_STATE, 'lower', 'upper') },
    updateConfig: (scheduler, params, paneId) => {
        (scheduler as IndicatorScheduler).updateDonchianConfig(params as Partial<DonchianSchedulerConfig>, paneId)
    },
    applyResult: (host, state, paneId) => {
        host.setSharedState(createDonchianStateKey(paneId), state as any, 'indicator_scheduler')
    },
})
class DonchianDefinition {
    static rendererFactory = createDonchianRendererPlugin
}