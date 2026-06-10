import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { CMFRenderState } from '../../indicators/cmfState'
import { createCMFStateKey, EMPTY_CMF_STATE } from '../../indicators/cmfState'
import type { TitleInfo } from '../../indicators/indicatorMetadata'
import type { KLineData } from '../../../types/price'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { createFixedRangeSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, CMFSchedulerConfig } from '../../indicators/scheduler'
import { calcCMFData } from '../../indicators/calculators'

const CMF_COLOR = '#06b6d4'

type LinePoint = { x: number; y: number }

function getCMFStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn(`[CMFRenderer] Scheduler not available via service locator`)
        return null
    }
    const meta = scheduler.getIndicatorMetadata('cmf')
    if (!meta) {
        console.warn(`[CMFRenderer] Indicator metadata for 'cmf' not found, skip rendering`)
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createCMFRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
    const { paneId = 'sub_CMF' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getCMFStateKey(pluginHost, paneId)
    }
    return {
        name: `cmf_${paneId}`,
        version: '1.1.0',
        description: 'CMF Chaikin 资金流渲染器（WebGL + Canvas2D 回退）',
        debugName: 'CMF',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,
        onInstall(host) { pluginHost = host },
        getDeclaredNamespaces() { const key = resolveKey(); return key ? [key] : [] },
        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters, lineWebGLSurface } = context
            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<CMFRenderState>(stateKey)
            if (!state || !state.params.showCMF || state.visibleMin > state.visibleMax) return

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
                    [{ points, width: 1, color: CMF_COLOR }],
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
            ctx.strokeStyle = CMF_COLOR
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
            const state = pluginHost?.getSharedState<CMFRenderState>(stateKey)
            return state?.params ?? {}
        },
        setConfig() {},
    }
}

export function getCMFTitleInfo(
    _data: KLineData[],
    index: number | null,
    params: Record<string, number | boolean | string>,
    host: PluginHost,
    paneId: string,
): TitleInfo | null {
    if (index === null) return null
    const period = (params.period as number) ?? 20
    const state = host.getSharedState<CMFRenderState>(createCMFStateKey(paneId))
    const value = state?.series[index]
    if (value === undefined) return null

    return {
        name: 'CMF',
        params: [period],
        values: [{ label: 'CMF', value, color: CMF_COLOR }],
    }
}

@Indicator({
    name: 'cmf',
    displayName: 'CMF',
    category: 'volume',
    defaultPaneId: 'sub_CMF',
    visibleState: { compose: createFixedRangeSparseVisibleStateComposer('cmf', EMPTY_CMF_STATE) },
    scale: { indicatorKey: 'cmf', label: 'CMF', decimals: 4 },
    getTitleInfo: getCMFTitleInfo,
    runtime: {
        defaultConfig: { period: 20, showCMF: true },
        computeKey: 'calcCMFData',
        compute: (data, c) => calcCMFData(data, c.period),
    },
})
class CMFIndicatorDefinition {
    static rendererFactory = createCMFRendererPlugin
}
