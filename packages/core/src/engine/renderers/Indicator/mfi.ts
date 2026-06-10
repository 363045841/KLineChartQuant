import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { MFIRenderState } from '../../indicators/mfiState'
import { createMFIStateKey, EMPTY_MFI_STATE } from '../../indicators/mfiState'
import type { TitleInfo } from '../../indicators/indicatorMetadata'
import type { KLineData } from '../../../types/price'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { createFixedRangeSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, MFISchedulerConfig } from '../../indicators/scheduler'
import { calcMFIData } from '../../indicators/calculators'

const MFI_COLOR = '#fb923c'

type LinePoint = { x: number; y: number }

function getMFIStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn(`[MFIRenderer] Scheduler not available via service locator`)
        return null
    }
    const meta = scheduler.getIndicatorMetadata('mfi')
    if (!meta) {
        console.warn(`[MFIRenderer] Indicator metadata for 'mfi' not found, skip rendering`)
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createMFIRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
    const { paneId = 'sub_MFI' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getMFIStateKey(pluginHost, paneId)
    }
    return {
        name: `mfi_${paneId}`,
        version: '1.1.0',
        description: 'MFI 资金流强弱渲染器（WebGL + Canvas2D 回退，80/20 超买超卖线）',
        debugName: 'MFI',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,
        onInstall(host) { pluginHost = host },
        getDeclaredNamespaces() { const key = resolveKey(); return key ? [key] : [] },
        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters, lineWebGLSurface } = context
            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<MFIRenderState>(stateKey)
            if (!state || !state.params.showMFI || state.visibleMin > state.visibleMax) return

            const { valueMin, valueMax, series } = state
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayMax = displayRange.maxPrice
            const displayValueRange = displayMax - displayMin || 1
            const paneH = pane.height
            const invRange = paneH / displayValueRange
            const rangeStart = range.start
            const toY = (v: number) => paneH - (v - displayMin) * invRange

            // 80 / 20 reference lines
            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)'
            ctx.lineWidth = 1
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            ctx.moveTo(scrollLeft, toY(80))
            ctx.lineTo(scrollLeft + context.paneWidth, toY(80))
            ctx.stroke()
            ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)'
            ctx.beginPath()
            ctx.moveTo(scrollLeft, toY(20))
            ctx.lineTo(scrollLeft + context.paneWidth, toY(20))
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
                points.push({ x: centerX, y: toY(value) })
            }

            if (points.length < 2) return

            const enableWebGL = context.settings?.enableWebGLRendering !== false
            let usedWebGL = false
            if (enableWebGL && lineWebGLSurface?.isAvailable()) {
                const allOk = lineWebGLSurface.drawLineStrips(
                    [{ points, width: 1, color: MFI_COLOR }],
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
            ctx.strokeStyle = MFI_COLOR
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
            const state = pluginHost?.getSharedState<MFIRenderState>(stateKey)
            return state?.params ?? {}
        },
        setConfig() {},
    }
}

export function getMFITitleInfo(
    _data: KLineData[],
    index: number | null,
    params: Record<string, number | boolean | string>,
    host: PluginHost,
    paneId: string,
): TitleInfo | null {
    if (index === null) return null
    const period = (params.period as number) ?? 14
    const state = host.getSharedState<MFIRenderState>(createMFIStateKey(paneId))
    const value = state?.series[index]
    if (value === undefined) return null

    return {
        name: 'MFI',
        params: [period],
        values: [{ label: 'MFI', value, color: MFI_COLOR }],
    }
}

@Indicator({
    name: 'mfi',
    displayName: 'MFI',
    category: 'volume',
    defaultPaneId: 'sub_MFI',
    visibleState: { compose: createFixedRangeSparseVisibleStateComposer('mfi', EMPTY_MFI_STATE) },
    scale: { indicatorKey: 'mfi', label: 'MFI', decimals: 2 },
    getTitleInfo: getMFITitleInfo,
    runtime: {
        defaultConfig: { period: 14, showMFI: true },
        computeKey: 'calcMFIData',
        compute: (data, c) => calcMFIData(data, c.period),
    },
})
class MFIIndicatorDefinition {
    static rendererFactory = createMFIRendererPlugin
}
