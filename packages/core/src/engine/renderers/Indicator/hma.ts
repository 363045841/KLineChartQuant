import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { HMARenderState } from '../../indicators/hmaState'
import { createHMAStateKey, EMPTY_HMA_STATE } from '../../indicators/hmaState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import type { IndicatorScheduler, HMASchedulerConfig } from '../../indicators/scheduler'

const HMA_COLOR = '#f43f5e'

type Point = { x: number; y: number }

export interface HMARendererOptions {
    paneId?: string
}

function getHMAStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn('[HMARenderer] Scheduler not available via service locator')
        return null
    }
    const meta = scheduler.getIndicatorMetadata('hma')
    if (!meta) {
        console.warn('[HMARenderer] Indicator metadata for \'hma\' not found, skip rendering')
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createHMARendererPlugin(options: HMARendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'main' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getHMAStateKey(pluginHost, paneId)
    }

    return {
        name: `hma_${paneId}`,
        version: '1.1.0',
        description: 'HMA Hull 移动均线渲染器（WebGL + Canvas2D 回退）',
        debugName: 'HMA',
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
            const state = pluginHost?.getSharedState<HMARenderState>(stateKey)
            if (!state || !state.params.showHMA || state.visibleMin > state.visibleMax) return

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
                    [{ points, width: 1, color: HMA_COLOR }],
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
            ctx.strokeStyle = HMA_COLOR
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
            const state = pluginHost?.getSharedState<HMARenderState>(stateKey)
            return state?.params ?? {}
        },

        setConfig() {
            // no-op
        },
    }
}

@Indicator({
    name: 'hma',
    displayName: 'HMA',
    category: 'main',
    stateKey: createHMAStateKey,
    defaultPaneId: 'main',
    paneIdField: 'hmaPaneId',
    allowMainPane: true,
    mainPane: { rendererName: 'hma_main', toActiveConfig: (params, active) => ({ ...params, showHMA: active }) },
    visibleState: { compose: createSparseVisibleStateComposer('hma', EMPTY_HMA_STATE) },
    scale: { indicatorKey: 'hma', label: 'HMA', decimals: 2 },
    updateConfig: (scheduler, params, paneId) => {
        (scheduler as IndicatorScheduler).updateHMAConfig(params as Partial<HMASchedulerConfig>, paneId)
    },
    applyResult: (host, state, paneId) => {
        host.setSharedState(createHMAStateKey(paneId), state as any, 'indicator_scheduler')
    },
})
class HMADefinition {
    static rendererFactory = createHMARendererPlugin
}
