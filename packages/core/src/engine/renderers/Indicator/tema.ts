import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import type { KLineData } from '../../../types/price'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { TEMARenderState } from '../../indicators/temaState'
import { createTEMAStateKey, EMPTY_TEMA_STATE } from '../../indicators/temaState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey, type TitleInfo, type TitleValueItem, type GetTitleInfoFn } from '../../indicators/indicatorMetadata'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import type { IndicatorScheduler, TEMASchedulerConfig } from '../../indicators/scheduler'
import { calcTEMAData } from '../../indicators/calculators'

const TEMA_COLOR = '#d946ef'

type Point = { x: number; y: number }

export interface TEMARendererOptions {
    paneId?: string
}

function getTEMAStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn('[TEMARenderer] Scheduler not available via service locator')
        return null
    }
    const meta = scheduler.getIndicatorMetadata('tema')
    if (!meta) {
        console.warn('[TEMARenderer] Indicator metadata for \'tema\' not found, skip rendering')
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createTEMARendererPlugin(options: TEMARendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'main' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getTEMAStateKey(pluginHost, paneId)
    }

    return {
        name: `tema_${paneId}`,
        version: '1.1.0',
        description: 'TEMA 三重指数移动均线渲染器（WebGL + Canvas2D 回退）',
        debugName: 'TEMA',
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
            const state = pluginHost?.getSharedState<TEMARenderState>(stateKey)
            if (!state || !state.params.showTEMA || state.visibleMin > state.visibleMax) return

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
                    [{ points, width: 1, color: TEMA_COLOR }],
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
            ctx.strokeStyle = TEMA_COLOR
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
            const state = pluginHost?.getSharedState<TEMARenderState>(stateKey)
            return state?.params ?? {}
        },

        setConfig() {
            // no-op
        },
    }
}

export const getTEMATitleInfo: GetTitleInfoFn = (
    _data: KLineData[],
    index: number | null,
    _params: Record<string, number | boolean | string>,
    pluginHost: PluginHost,
    paneId: string,
): TitleInfo | null => {
    if (index === null) return null

    const stateKey = createTEMAStateKey(paneId)
    const state = pluginHost?.getSharedState<TEMARenderState>(stateKey)
    if (!state || state.visibleMin > state.visibleMax) return null

    const value = state.series[index]
    if (value === undefined) return null

    return {
        name: 'TEMA',
        params: [state.params.period],
        values: [{ label: 'TEMA', value, color: '#d946ef' }],
    }
}

@Indicator({
    name: 'tema',
    displayName: 'TEMA',
    getTitleInfo: getTEMATitleInfo,
    category: 'main',
    defaultPaneId: 'main',
    allowMainPane: true,
    mainPane: { rendererName: 'tema_main', toActiveConfig: (params, active) => ({ ...params, showTEMA: active }) },
    visibleState: { compose: createSparseVisibleStateComposer('tema', EMPTY_TEMA_STATE) },
    scale: { indicatorKey: 'tema', label: 'TEMA', decimals: 2 },
    runtime: { defaultConfig:{period:14,showTEMA:true}, computeKey:'calcTEMAData', compute:(data,c)=>calcTEMAData(data,c.period) },
})
class TEMADefinition {
    static rendererFactory = createTEMARendererPlugin
}
