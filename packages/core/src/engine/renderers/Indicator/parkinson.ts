import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { ParkinsonRenderState } from '../../indicators/parkinsonState'
import { createParkinsonStateKey } from '../../indicators/parkinsonState'
import { EMPTY_PARKINSON_STATE } from '../../indicators/parkinsonState'
import { createNonNegativeSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, ParkinsonSchedulerConfig } from '../../indicators/scheduler'

const PARKINSON_COLOR = '#0891b2'

type LinePoint = { x: number; y: number }

function getParkinsonStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn(`[ParkinsonRenderer] Scheduler not available via service locator`)
        return null
    }
    const meta = scheduler.getIndicatorMetadata('parkinson')
    if (!meta) {
        console.warn(`[ParkinsonRenderer] Indicator metadata for 'parkinson' not found, skip rendering`)
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createParkinsonRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
    const { paneId = 'sub_Parkinson' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getParkinsonStateKey(pluginHost, paneId)
    }

    return {
        name: `parkinson_${paneId}`,
        version: '1.1.0',
        description: 'Parkinson 波动率渲染器（WebGL + Canvas2D 回退）',
        debugName: 'Parkinson',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,
        onInstall(host) { pluginHost = host },
        getDeclaredNamespaces() { const key = resolveKey(); return key ? [key] : [] },
        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters, lineWebGLSurface } = context
            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<ParkinsonRenderState>(stateKey)
            if (!state || !state.params.showParkinson || state.visibleMin > state.visibleMax) return

            const { valueMin, valueMax, series } = state
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayMax = displayRange.maxPrice
            const displayValueRange = displayMax - displayMin || 1
            const paneH = pane.height
            const invRange = paneH / displayValueRange
            const rangeStart = range.start

            const drawEnd = Math.min(range.end, series.length)
            const points: LinePoint[] = []
            for (let i = range.start; i < drawEnd; i++) {
                const value = series[i]
                if (value === undefined) continue
                const centerX = kLineCenters[i - rangeStart]
                if (centerX === undefined) continue
                points.push({ x: centerX, y: paneH - (value - displayMin) * invRange })
            }

            if (points.length < 2) return

            const enableWebGL = context.settings?.enableWebGLRendering !== false
            let usedWebGL = false
            if (enableWebGL && lineWebGLSurface?.isAvailable()) {
                const allOk = lineWebGLSurface.drawLineStrips(
                    [{ points, width: 1, color: PARKINSON_COLOR }],
                    scrollLeft,
                )
                if (allOk) {
                    usedWebGL = true
                    lineWebGLSurface.compositeTo(ctx, { imageSmoothingEnabled: false })
                }
            }

            if (usedWebGL) return

            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.strokeStyle = PARKINSON_COLOR
            ctx.lineWidth = 1
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'
            ctx.beginPath()
            ctx.moveTo(points[0]!.x, points[0]!.y)
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i]!.x, points[i]!.y)
            }
            ctx.stroke()
            ctx.restore()
        },
        getConfig() {
            const stateKey = resolveKey()
            if (!stateKey) return {}
            const state = pluginHost?.getSharedState<ParkinsonRenderState>(stateKey)
            return state?.params ?? {}
        },
        setConfig() {},
    }
}

@Indicator({
    name: 'parkinson',
    displayName: 'Parkinson',
    category: 'oscillator',
    stateKey: createParkinsonStateKey,
    defaultPaneId: 'sub_Parkinson',
    paneIdField: 'parkinsonPaneId',
    scale: { indicatorKey: 'parkinson', label: 'Parkinson', decimals: 2 },
    updateConfig: (scheduler, params, paneId) => {
        (scheduler as IndicatorScheduler).updateParkinsonConfig(params as Partial<ParkinsonSchedulerConfig>, paneId)
    },
    visibleState: { compose: createNonNegativeSparseVisibleStateComposer('parkinson', EMPTY_PARKINSON_STATE) },
    applyResult: (host, state, paneId) => {
        host.setSharedState(createParkinsonStateKey(paneId), state as any, 'indicator_scheduler')
    },
})
class ParkinsonIndicatorDefinition {
    static rendererFactory = createParkinsonRendererPlugin
}
