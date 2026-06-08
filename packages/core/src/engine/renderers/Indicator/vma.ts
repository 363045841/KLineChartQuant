import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { VMARenderState } from '../../indicators/vmaState'
import { createVMAStateKey } from '../../indicators/vmaState'
import { EMPTY_VMA_STATE } from '../../indicators/vmaState'
import { createNonNegativeSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, VMASchedulerConfig } from '../../indicators/scheduler'

const VMA_COLOR = '#0ea5e9'

type LinePoint = { x: number; y: number }

function getVMAStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn(`[VMARenderer] Scheduler not available via service locator`)
        return null
    }
    const meta = scheduler.getIndicatorMetadata('vma')
    if (!meta) {
        console.warn(`[VMARenderer] Indicator metadata for 'vma' not found, skip rendering`)
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createVMARendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
    const { paneId = 'sub_VMA' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getVMAStateKey(pluginHost, paneId)
    }
    return {
        name: `vma_${paneId}`,
        version: '1.1.0',
        description: 'VMA 成交量均线渲染器（WebGL + Canvas2D 回退）',
        debugName: 'VMA',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,
        onInstall(host) { pluginHost = host },
        getDeclaredNamespaces() { const key = resolveKey(); return key ? [key] : [] },
        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters, lineWebGLSurface } = context
            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<VMARenderState>(stateKey)
            if (!state || !state.params.showVMA || state.visibleMin > state.visibleMax) return

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
                    [{ points, width: 1, color: VMA_COLOR }],
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
            ctx.strokeStyle = VMA_COLOR
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
            const state = pluginHost?.getSharedState<VMARenderState>(stateKey)
            return state?.params ?? {}
        },
        setConfig() { },
    }
}

@Indicator({
    name: 'vma',
    displayName: 'VMA',
    category: 'volume',
    stateKey: createVMAStateKey,
    defaultPaneId: 'sub_VMA',
    paneIdField: 'vmaPaneId',
    scale: { indicatorKey: 'vma', label: 'VMA', decimals: 0 },
    updateConfig: (scheduler, params, paneId) => {
        (scheduler as IndicatorScheduler).updateVMAConfig(params as Partial<VMASchedulerConfig>, paneId)
    },
    visibleState: { compose: createNonNegativeSparseVisibleStateComposer('vma', EMPTY_VMA_STATE) },
    applyResult: (host, state, paneId) => {
        host.setSharedState(createVMAStateKey(paneId), state as any, 'indicator_scheduler')
    },
})
class VMAIndicatorDefinition {
    static rendererFactory = createVMARendererPlugin
}
