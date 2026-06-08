import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { DEMARenderState } from '../../indicators/demaState'
import { createDEMAStateKey, EMPTY_DEMA_STATE } from '../../indicators/demaState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import type { IndicatorScheduler, DEMASchedulerConfig } from '../../indicators/scheduler'

const DEMA_COLOR = '#6366f1'

type Point = { x: number; y: number }

export interface DEMARendererOptions {
    paneId?: string
}

function getDEMAStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn('[DEMARenderer] Scheduler not available via service locator')
        return null
    }
    const meta = scheduler.getIndicatorMetadata('dema')
    if (!meta) {
        console.warn('[DEMARenderer] Indicator metadata for \'dema\' not found, skip rendering')
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createDEMARendererPlugin(options: DEMARendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'main' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getDEMAStateKey(pluginHost, paneId)
    }

    return {
        name: `dema_${paneId}`,
        version: '1.1.0',
        description: 'DEMA 双重指数移动均线渲染器（WebGL + Canvas2D 回退）',
        debugName: 'DEMA',
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
            const state = pluginHost?.getSharedState<DEMARenderState>(stateKey)
            if (!state || !state.params.showDEMA || state.visibleMin > state.visibleMax) return

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
                    [{ points, width: 1, color: DEMA_COLOR }],
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
            ctx.strokeStyle = DEMA_COLOR
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
            const state = pluginHost?.getSharedState<DEMARenderState>(stateKey)
            return state?.params ?? {}
        },

        setConfig() {
            // no-op
        },
    }
}

@Indicator({
    name: 'dema',
    displayName: 'DEMA',
    category: 'main',
    stateKey: createDEMAStateKey,
    defaultPaneId: 'main',
    paneIdField: 'demaPaneId',
    allowMainPane: true,
    mainPane: { rendererName: 'dema_main', toActiveConfig: (params, active) => ({ ...params, showDEMA: active }) },
    visibleState: { compose: createSparseVisibleStateComposer('dema', EMPTY_DEMA_STATE) },
    scale: { indicatorKey: 'dema', label: 'DEMA', decimals: 2 },
    updateConfig: (scheduler, params, paneId) => {
        (scheduler as IndicatorScheduler).updateDEMAConfig(params as Partial<DEMASchedulerConfig>, paneId)
    },
    applyResult: (host, state, paneId) => {
        host.setSharedState(createDEMAStateKey(paneId), state as any, 'indicator_scheduler')
    },
})
class DEMADefinition {
    static rendererFactory = createDEMARendererPlugin
}
