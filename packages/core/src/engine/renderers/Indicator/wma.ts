import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { WMARenderState } from '../../indicators/wmaState'
import { createWMAStateKey, EMPTY_WMA_STATE } from '../../indicators/wmaState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import type { IndicatorScheduler, WMASchedulerConfig } from '../../indicators/scheduler'

const WMA_COLOR = '#10b981'

type Point = { x: number; y: number }

export interface WMARendererOptions {
    paneId?: string
}

function getWMAStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn('[WMARenderer] Scheduler not available via service locator')
        return null
    }
    const meta = scheduler.getIndicatorMetadata('wma')
    if (!meta) {
        console.warn('[WMARenderer] Indicator metadata for \'wma\' not found, skip rendering')
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createWMARendererPlugin(options: WMARendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'main' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getWMAStateKey(pluginHost, paneId)
    }

    return {
        name: `wma_${paneId}`,
        version: '1.1.0',
        description: 'WMA 线性加权移动均线渲染器（WebGL + Canvas2D 回退）',
        debugName: 'WMA',
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
            const state = pluginHost?.getSharedState<WMARenderState>(stateKey)
            if (!state || !state.params.showWMA || state.visibleMin > state.visibleMax) return

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
                    [{ points, width: 1, color: WMA_COLOR }],
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
            ctx.strokeStyle = WMA_COLOR
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
            const state = pluginHost?.getSharedState<WMARenderState>(stateKey)
            return state?.params ?? {}
        },

        setConfig() {
            // no-op
        },
    }
}

@Indicator({
    name: 'wma',
    displayName: 'WMA',
    category: 'main',
    stateKey: createWMAStateKey,
    defaultPaneId: 'main',
    paneIdField: 'wmaPaneId',
    allowMainPane: true,
    mainPane: { rendererName: 'wma_main', toActiveConfig: (params, active) => ({ ...params, showWMA: active }) },
    visibleState: { compose: createSparseVisibleStateComposer('wma', EMPTY_WMA_STATE) },
    scale: { indicatorKey: 'wma', label: 'WMA', decimals: 2 },
    updateConfig: (scheduler, params, paneId) => {
        (scheduler as IndicatorScheduler).updateWMAConfig(params as Partial<WMASchedulerConfig>, paneId)
    },
    applyResult: (host, state, paneId) => {
        host.setSharedState(createWMAStateKey(paneId), state as any, 'indicator_scheduler')
    },
})
class WMADefinition {
    static rendererFactory = createWMARendererPlugin
}
