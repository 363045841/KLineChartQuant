import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { KAMARenderState } from '../../indicators/kamaState'
import { createKAMAStateKey, EMPTY_KAMA_STATE } from '../../indicators/kamaState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import type { IndicatorScheduler, KAMASchedulerConfig } from '../../indicators/scheduler'

const KAMA_COLOR = '#0ea5e9'

type Point = { x: number; y: number }

export interface KAMARendererOptions {
    paneId?: string
}

function getKAMAStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn('[KAMARenderer] Scheduler not available via service locator')
        return null
    }
    const meta = scheduler.getIndicatorMetadata('kama')
    if (!meta) {
        console.warn('[KAMARenderer] Indicator metadata for \'kama\' not found, skip rendering')
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createKAMARendererPlugin(options: KAMARendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'main' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getKAMAStateKey(pluginHost, paneId)
    }

    return {
        name: `kama_${paneId}`,
        version: '1.1.0',
        description: 'KAMA Kaufman 自适应均线渲染器（WebGL + Canvas2D 回退）',
        debugName: 'KAMA',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,

        onInstall(host: PluginHost) {
            pluginHost = host
        },

        getDeclaredNamespaces() {
            const key = resolveKey()
            return key ? [key] : []
        },

        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters, lineWebGLSurface } = context

            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<KAMARenderState>(stateKey)
            if (!state || !state.params.showKAMA || state.visibleMin > state.visibleMax) return

            const { series } = state
            const drawEnd = Math.min(range.end, series.length)
            const rangeStart = range.start

            const points: Point[] = []
            for (let i = range.start; i < drawEnd; i++) {
                const value = series[i]
                if (value === undefined) continue
                const centerX = kLineCenters[i - rangeStart]
                if (centerX === undefined) continue
                points.push({ x: centerX, y: pane.yAxis.priceToY(value) })
            }

            if (points.length < 2) return

            const enableWebGL = context.settings?.enableWebGLRendering !== false
            let usedWebGL = false
            if (enableWebGL && lineWebGLSurface?.isAvailable()) {
                const allOk = lineWebGLSurface.drawLineStrips(
                    [{ points, width: 1, color: KAMA_COLOR }],
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
            ctx.strokeStyle = KAMA_COLOR
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
            const state = pluginHost?.getSharedState<KAMARenderState>(stateKey)
            return state?.params ?? {}
        },

        setConfig() {
            // no-op
        },
    }
}

@Indicator({
    name: 'kama',
    displayName: 'KAMA',
    category: 'main',
    stateKey: createKAMAStateKey,
    defaultPaneId: 'main',
    paneIdField: 'kamaPaneId',
    allowMainPane: true,
    mainPane: { rendererName: 'kama_main', toActiveConfig: (params, active) => ({ ...params, showKAMA: active }) },
    visibleState: { compose: createSparseVisibleStateComposer('kama', EMPTY_KAMA_STATE) },
    scale: { indicatorKey: 'kama', label: 'KAMA', decimals: 2 },
    updateConfig: (scheduler, params, paneId) => {
        (scheduler as IndicatorScheduler).updateKAMAConfig(params as Partial<KAMASchedulerConfig>, paneId)
    },
    applyResult: (host, state, paneId) => {
        host.setSharedState(createKAMAStateKey(paneId), state as any, 'indicator_scheduler')
    },
})
class KAMADefinition {
    static rendererFactory = createKAMARendererPlugin
}
