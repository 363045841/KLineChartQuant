import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { KLineData } from '../../../types/price'
import type { IchimokuRenderState } from '../../indicators/ichimokuState'
import { createIchimokuStateKey, EMPTY_ICHIMOKU_STATE } from '../../indicators/ichimokuState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey, type TitleInfo, type TitleValueItem, type GetTitleInfoFn } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, IchimokuSchedulerConfig } from '../../indicators/scheduler'
import { calcIchimokuData } from '../../indicators/calculators'
import { createValuePointVisibleStateComposer } from '../../indicators/visibleStateComposers'

const TENKAN_COLOR = '#dc2626'
const KIJUN_COLOR = '#2563eb'
const SPAN_A_COLOR = '#16a34a'
const SPAN_B_COLOR = '#dc2626'
const CHIKOU_COLOR = '#7c3aed'
const CLOUD_BULL = 'rgba(34, 197, 94, 0.15)'
const CLOUD_BEAR = 'rgba(239, 68, 68, 0.15)'

type Point = { x: number; y: number }

export interface IchimokuRendererOptions {
    paneId?: string
}

function getIchimokuStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn('[IchimokuRenderer] Scheduler not available via service locator')
        return null
    }
    const meta = scheduler.getIndicatorMetadata('ichimoku')
    if (!meta) {
        console.warn('[IchimokuRenderer] Indicator metadata for \'ichimoku\' not found, skip rendering')
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createIchimokuRendererPlugin(options: IchimokuRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'main' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getIchimokuStateKey(pluginHost, paneId)
    }

    return {
        name: `ichimoku_${paneId}`,
        version: '1.1.0',
        description: '一目均衡表渲染器（WebGL 线 + Canvas2D 云图）',
        debugName: 'Ichimoku',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,

        onInstall(host: PluginHost) { pluginHost = host },
        getDeclaredNamespaces() { const key = resolveKey(); return key ? [key] : [] },

        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters, lineWebGLSurface } = context
            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<IchimokuRenderState>(stateKey)
            if (!state || state.visibleMin > state.visibleMax) return
            const { params, series } = state

            const toY = (price: number) => pane.yAxis.priceToY(price)
            const rangeStart = range.start

            const tenkanPts: Point[] = []
            const kijunPts: Point[] = []
            const spanAPts: Point[] = []
            const spanBPts: Point[] = []
            const chikouPts: Point[] = []
            const cloudSegs: { x: number; ya: number; yb: number; bull: boolean }[] = []

            const drawEnd = Math.min(range.end, series.length)
            for (let i = range.start; i < drawEnd; i++) {
                const p = series[i]
                if (!p) continue
                const centerX = kLineCenters[i - rangeStart]
                if (centerX === undefined) continue
                if (params.showTenkan && p.tenkan !== undefined) tenkanPts.push({ x: centerX, y: toY(p.tenkan) })
                if (params.showKijun && p.kijun !== undefined) kijunPts.push({ x: centerX, y: toY(p.kijun) })
                if (params.showSpanA && p.spanA !== undefined) spanAPts.push({ x: centerX, y: toY(p.spanA) })
                if (params.showSpanB && p.spanB !== undefined) spanBPts.push({ x: centerX, y: toY(p.spanB) })
                if (params.showChikou && p.chikou !== undefined) chikouPts.push({ x: centerX, y: toY(p.chikou) })
                if (params.showCloud && p.spanA !== undefined && p.spanB !== undefined) {
                    cloudSegs.push({ x: centerX, ya: toY(p.spanA), yb: toY(p.spanB), bull: p.spanA > p.spanB })
                }
            }

            // Cloud fill (Canvas2D only)
            if (params.showCloud && cloudSegs.length >= 2) {
                ctx.save()
                ctx.translate(-scrollLeft, 0)
                fillCloud(ctx, cloudSegs)
                ctx.restore()
            }

            // Lines (WebGL + Canvas2D fallback)
            const lines: Array<{ points: Point[]; width: number; color: string }> = []
            if (tenkanPts.length >= 2) lines.push({ points: tenkanPts, width: 1, color: TENKAN_COLOR })
            if (kijunPts.length >= 2) lines.push({ points: kijunPts, width: 1, color: KIJUN_COLOR })
            if (spanAPts.length >= 2) lines.push({ points: spanAPts, width: 1, color: SPAN_A_COLOR })
            if (spanBPts.length >= 2) lines.push({ points: spanBPts, width: 1, color: SPAN_B_COLOR })
            if (chikouPts.length >= 2) lines.push({ points: chikouPts, width: 1, color: CHIKOU_COLOR })

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
            drawLine(ctx, tenkanPts, TENKAN_COLOR)
            drawLine(ctx, kijunPts, KIJUN_COLOR)
            drawLine(ctx, spanAPts, SPAN_A_COLOR)
            drawLine(ctx, spanBPts, SPAN_B_COLOR)
            drawLine(ctx, chikouPts, CHIKOU_COLOR)
            ctx.restore()
        },

        getConfig() {
            const stateKey = resolveKey()
            if (!stateKey) return {}
            const state = pluginHost?.getSharedState<IchimokuRenderState>(stateKey)
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

function fillCloud(
    ctx: CanvasRenderingContext2D,
    segs: { x: number; ya: number; yb: number; bull: boolean }[],
): void {
    for (let i = 0; i < segs.length - 1; i++) {
        const a = segs[i]!
        const b = segs[i + 1]!
        ctx.fillStyle = a.bull ? CLOUD_BULL : CLOUD_BEAR
        ctx.beginPath()
        ctx.moveTo(a.x, a.ya)
        ctx.lineTo(b.x, b.ya)
        ctx.lineTo(b.x, b.yb)
        ctx.lineTo(a.x, a.yb)
        ctx.closePath()
        ctx.fill()
    }
}

export function getIchimokuTitleInfo(
    _data: KLineData[],
    index: number | null,
    params: Record<string, number | boolean | string>,
    host: PluginHost,
    paneId: string,
): TitleInfo | null {
    if (index === null) return null
    const state = host.getSharedState<IchimokuRenderState>(createIchimokuStateKey(paneId))
    const p = state?.series[index]
    if (!p) return null

    const values: TitleValueItem[] = []
    if (p.tenkan !== undefined) values.push({ label: 'Tenkan', value: p.tenkan, color: '#dc2626' })
    if (p.kijun !== undefined) values.push({ label: 'Kijun', value: p.kijun, color: '#2563eb' })
    if (p.spanA !== undefined) values.push({ label: 'SpanA', value: p.spanA, color: '#16a34a' })
    if (p.spanB !== undefined) values.push({ label: 'SpanB', value: p.spanB, color: '#dc2626' })
    if (p.chikou !== undefined) values.push({ label: 'Chikou', value: p.chikou, color: '#7c3aed' })

    return {
        name: 'Ichimoku',
        params: [(params.tenkanPeriod as number) ?? 9, (params.kijunPeriod as number) ?? 26, (params.spanBPeriod as number) ?? 52, (params.displacement as number) ?? 26],
        values,
    }
}

@Indicator({
    name: 'ichimoku',
    displayName: 'Ichimoku',
    getTitleInfo: getIchimokuTitleInfo,
    category: 'main',
    defaultPaneId: 'main',
    allowMainPane: true,
    mainPane: { rendererName: 'ichimoku_main', toActiveConfig: (params, active) => ({ ...params, showTenkan: active, showKijun: active, showSpanA: active, showSpanB: active, showChikou: active, showCloud: active }) },
    scale: { indicatorKey: 'ichimoku', label: 'Ichimoku', decimals: 2 },
    visibleState: { compose: createValuePointVisibleStateComposer('ichimoku', EMPTY_ICHIMOKU_STATE, ['tenkan', 'kijun', 'spanA', 'spanB', 'chikou']) },
    runtime: { defaultConfig:{tenkanPeriod:9,kijunPeriod:26,spanBPeriod:52,displacement:26,showTenkan:true,showKijun:true,showSpanA:true,showSpanB:true,showCloud:true,showChikou:true}, computeKey:'calcIchimokuData', compute:(data,c)=>calcIchimokuData(data,c.tenkanPeriod,c.kijunPeriod,c.spanBPeriod,c.displacement) },
})
class IchimokuDefinition {
    static rendererFactory = createIchimokuRendererPlugin
}