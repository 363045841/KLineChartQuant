import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { KLineData } from '../../../types/price'
import type { KeltnerRenderState } from '../../indicators/keltnerState'
import { createKeltnerStateKey, EMPTY_KELTNER_STATE } from '../../indicators/keltnerState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey, type TitleInfo, type GetTitleInfoFn } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, KeltnerSchedulerConfig } from '../../indicators/scheduler'
import { calcKeltnerData } from '../../indicators/calculators'
import { createBandVisibleStateComposer } from '../../indicators/visibleStateComposers'

const KELTNER_UPPER_COLOR = '#7c3aed'
const KELTNER_MIDDLE_COLOR = '#f59e0b'
const KELTNER_LOWER_COLOR = '#7c3aed'

type Point = { x: number; y: number }

export interface KeltnerRendererOptions { paneId?: string }

function getKeltnerStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn('[KeltnerRenderer] Scheduler not available via service locator')
        return null
    }
    const meta = scheduler.getIndicatorMetadata('keltner')
    if (!meta) {
        console.warn(`[KeltnerRenderer] Indicator metadata for 'keltner' not found, skip rendering`)
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createKeltnerRendererPlugin(options: KeltnerRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'main' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getKeltnerStateKey(pluginHost, paneId)
    }

    return {
        name: `keltner_${paneId}`,
        version: '1.1.0',
        description: 'Keltner Channel 渲染器（WebGL + Canvas2D 回退）',
        debugName: 'Keltner',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,

        onInstall(host: PluginHost) { pluginHost = host },
        getDeclaredNamespaces() { const key = resolveKey(); return key ? [key] : [] },

        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters, lineWebGLSurface } = context
            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<KeltnerRenderState>(stateKey)
            if (!state || state.visibleMin > state.visibleMax) return
            const { showUpper, showMiddle, showLower } = state.params
            if (!showUpper && !showMiddle && !showLower) return

            const { series } = state
            const toY = (v: number) => pane.yAxis.priceToY(v)
            const rangeStart = range.start

            const upperPts: Point[] = []
            const middlePts: Point[] = []
            const lowerPts: Point[] = []
            const drawEnd = Math.min(range.end, series.length)
            for (let i = range.start; i < drawEnd; i++) {
                const point = series[i]
                if (!point) continue
                const centerX = kLineCenters[i - rangeStart]
                if (centerX === undefined) continue
                if (showUpper) upperPts.push({ x: centerX, y: toY(point.upper) })
                if (showMiddle) middlePts.push({ x: centerX, y: toY(point.middle) })
                if (showLower) lowerPts.push({ x: centerX, y: toY(point.lower) })
            }

            const lines: Array<{ points: Point[]; width: number; color: string }> = []
            if (upperPts.length >= 2) lines.push({ points: upperPts, width: 1, color: KELTNER_UPPER_COLOR })
            if (middlePts.length >= 2) lines.push({ points: middlePts, width: 1, color: KELTNER_MIDDLE_COLOR })
            if (lowerPts.length >= 2) lines.push({ points: lowerPts, width: 1, color: KELTNER_LOWER_COLOR })

            const enableWebGL = context.settings?.enableWebGLRendering !== false
            let usedWebGL = false
            if (enableWebGL && lineWebGLSurface?.isAvailable()) {
                const allOk = lines.length > 0 && lineWebGLSurface.drawLineStrips(lines, scrollLeft)
                if (allOk) {
                    usedWebGL = true
                    lineWebGLSurface.compositeTo(ctx, { imageSmoothingEnabled: false })
                }
            }

            if (usedWebGL) return

            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.lineWidth = 1
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'
            drawLine(ctx, upperPts, KELTNER_UPPER_COLOR)
            drawLine(ctx, middlePts, KELTNER_MIDDLE_COLOR)
            drawLine(ctx, lowerPts, KELTNER_LOWER_COLOR)
            ctx.restore()
        },

        getConfig() {
            const stateKey = resolveKey()
            if (!stateKey) return {}
            const state = pluginHost?.getSharedState<KeltnerRenderState>(stateKey)
            return state?.params ?? {}
        },
        setConfig() {},
    }
}

function drawLine(ctx: CanvasRenderingContext2D, pts: Point[], color: string): void {
    if (pts.length < 2) return
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.moveTo(pts[0]!.x, pts[0]!.y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y)
    ctx.stroke()
}

export function getKeltnerTitleInfo(
    _data: KLineData[],
    index: number | null,
    params: Record<string, number | boolean | string>,
    host: PluginHost,
    paneId: string,
): TitleInfo | null {
    if (index === null) return null
    const state = host.getSharedState<KeltnerRenderState>(createKeltnerStateKey(paneId))
    const p = state?.series[index]
    if (!p) return null

    return {
        name: 'Keltner',
        params: [(params.emaPeriod as number) ?? 20, (params.atrPeriod as number) ?? 10, (params.multiplier as number) ?? 2],
        values: [
            { label: 'Upper', value: p.upper, color: '#7c3aed' },
            { label: 'Mid', value: p.middle, color: '#f59e0b' },
            { label: 'Lower', value: p.lower, color: '#7c3aed' },
        ],
    }
}

@Indicator({
    name: 'keltner',
    displayName: 'Keltner',
    getTitleInfo: getKeltnerTitleInfo,
    category: 'main',
    defaultPaneId: 'main',
    allowMainPane: true,
    mainPane: { rendererName: 'keltner_main', toActiveConfig: (params, active) => ({ ...params, showUpper: active, showMiddle: active, showLower: active }) },
    scale: { indicatorKey: 'keltner', label: 'Keltner', decimals: 2 },
    visibleState: { compose: createBandVisibleStateComposer('keltner', EMPTY_KELTNER_STATE, 'lower', 'upper') },
    runtime: { defaultConfig:{emaPeriod:20,atrPeriod:10,multiplier:2,showUpper:true,showMiddle:true,showLower:true}, computeKey:'calcKeltnerData', compute:(data,c)=>calcKeltnerData(data,c.emaPeriod,c.atrPeriod,c.multiplier) },
})
class KeltnerDefinition {
    static rendererFactory = createKeltnerRendererPlugin
}