import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { ChaikinVolRenderState } from '../../indicators/chaikinVolState'
import { createChaikinVolStateKey, EMPTY_CHAIKIN_VOL_STATE } from '../../indicators/chaikinVolState'
import type { TitleInfo } from '../../indicators/indicatorMetadata'
import type { KLineData } from '../../../types/price'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import type { IndicatorScheduler, ChaikinVolSchedulerConfig } from '../../indicators/scheduler'
import { calcChaikinVolData } from '../../indicators/calculators'

const CHAIKIN_VOL_COLOR = '#f59e0b'

type LinePoint = { x: number; y: number }

function getChaikinVolStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn(`[ChaikinVolRenderer] Scheduler not available via service locator`)
        return null
    }
    const meta = scheduler.getIndicatorMetadata('chaikinVol')
    if (!meta) {
        console.warn(`[ChaikinVolRenderer] Indicator metadata for 'chaikinVol' not found, skip rendering`)
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createChaikinVolRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
    const { paneId = 'sub_ChaikinVol' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getChaikinVolStateKey(pluginHost, paneId)
    }

    return {
        name: `chaikinVol_${paneId}`,
        version: '1.1.0',
        description: 'Chaikin Volatility 渲染器（WebGL + Canvas2D 回退）',
        debugName: 'ChaikinVol',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,
        onInstall(host) { pluginHost = host },
        getDeclaredNamespaces() { const key = resolveKey(); return key ? [key] : [] },
        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters, lineWebGLSurface } = context
            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<ChaikinVolRenderState>(stateKey)
            if (!state || !state.params.showChaikinVol || state.visibleMin > state.visibleMax) return

            const { valueMin, valueMax, series } = state
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayMax = displayRange.maxPrice
            const displayValueRange = displayMax - displayMin || 1
            const paneH = pane.height
            const invRange = paneH / displayValueRange
            const rangeStart = range.start

            // Zero line
            const zeroY = paneH - (0 - displayMin) * invRange
            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
            ctx.lineWidth = 1
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            ctx.moveTo(scrollLeft, zeroY)
            ctx.lineTo(scrollLeft + context.paneWidth, zeroY)
            ctx.stroke()
            ctx.setLineDash([])
            ctx.restore()

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
                    [{ points, width: 1, color: CHAIKIN_VOL_COLOR }],
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
            ctx.strokeStyle = CHAIKIN_VOL_COLOR
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
            const state = pluginHost?.getSharedState<ChaikinVolRenderState>(stateKey)
            return state?.params ?? {}
        },
        setConfig() {},
    }
}

export function getChaikinVolTitleInfo(
    _data: KLineData[],
    index: number | null,
    params: Record<string, number | boolean | string>,
    host: PluginHost,
    paneId: string,
): TitleInfo | null {
    if (index === null) return null
    const emaPeriod = (params.emaPeriod as number) ?? 10
    const rocPeriod = (params.rocPeriod as number) ?? 10
    const state = host.getSharedState<ChaikinVolRenderState>(createChaikinVolStateKey(paneId))
    const value = state?.series[index]
    if (value === undefined) return null

    return {
        name: 'ChaikinVol',
        params: [emaPeriod, rocPeriod],
        values: [{ label: 'ChaikinVol', value, color: CHAIKIN_VOL_COLOR }],
    }
}

@Indicator({
    name: 'chaikinVol',
    displayName: 'ChaikinVol',
    category: 'oscillator',
    defaultPaneId: 'sub_ChaikinVol',
    visibleState: { compose: createSparseVisibleStateComposer('chaikinVol', EMPTY_CHAIKIN_VOL_STATE) },
    scale: { indicatorKey: 'chaikinVol', label: 'ChaikinVol', decimals: 2 },
    getTitleInfo: getChaikinVolTitleInfo,
    runtime: {
        defaultConfig: { emaPeriod: 10, rocPeriod: 10, showChaikinVol: true },
        computeKey: 'calcChaikinVolData',
        compute: (data, c) => calcChaikinVolData(data, c.emaPeriod, c.rocPeriod),
    },
})
class ChaikinVolIndicatorDefinition {
    static rendererFactory = createChaikinVolRendererPlugin
}
