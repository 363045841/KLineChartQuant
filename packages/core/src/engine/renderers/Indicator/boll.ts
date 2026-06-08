import type { RendererPluginWithHost, PluginHost, RenderContext } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { KLineData } from '../../../types/price'
import { alignToPhysicalPixelCenter } from '../../draw/pixelAlign'
import { resolveThemeColors } from '../../../tokens'
import { BOLL_STATE_KEY, type BOLLRenderState } from '../../indicators/bollState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorPriceRangeComputer, IndicatorRenderStateComposer } from '../../indicators/indicatorMetadata'
import type { BOLLSchedulerConfig, IndicatorScheduler } from '../../indicators/scheduler'

type LinePoint = { x: number; y: number }

const BOLL_LINE_WIDTH = 1

interface PriceData {
    upper: number
    middle: number
    lower: number
}

function getRgbaAlpha(color: string): number {
    const match = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/i)
    if (!match) return 1
    const alpha = Number(match[1])
    return Number.isFinite(alpha) ? alpha : 1
}

function toOpaqueRgba(color: string): string {
    return color.replace(/,\s*[\d.]+\s*\)$/i, ', 1)')
}

function compositeLineSurface(
    context: RenderContext,
    surface: NonNullable<RenderContext['lineWebGLSurface']>,
    alpha = 1
): void {
    surface.compositeTo(context.ctx, {
        alpha,
        imageSmoothingEnabled: false,
    })
}

function drawBOLLWithWebGL(
    context: RenderContext,
    data: {
        showUpper: boolean
        showMiddle: boolean
        showLower: boolean
        showBand: boolean
        upperPoints: LinePoint[]
        middlePoints: LinePoint[]
        lowerPoints: LinePoint[]
        bandUpperPoints: LinePoint[]
        bandLowerPoints: LinePoint[]
    }
): boolean {
    const colors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)
    if (context.settings?.enableWebGLRendering === false) return false
    const surface = context.lineWebGLSurface
    if (!surface || !surface.isAvailable()) return false

    surface.clear()

    let allOk = true
    if (data.showBand && data.bandUpperPoints.length >= 2 && data.bandLowerPoints.length >= 2) {
        surface.clear()
        allOk = surface.drawFilledBand(
            { upperPoints: data.bandUpperPoints, lowerPoints: data.bandLowerPoints },
            toOpaqueRgba(colors.boll.bandFill),
            context.scrollLeft
        )
        if (allOk) {
            compositeLineSurface(context, surface, getRgbaAlpha(colors.boll.bandFill))
        }
    }
    surface.clear()

    const lineStrips: Array<{ points: LinePoint[]; width: number; color: string }> = []
    if (data.showUpper && data.upperPoints.length >= 2) {
        lineStrips.push({ points: data.upperPoints, width: BOLL_LINE_WIDTH, color: colors.boll.upper })
    }
    if (data.showMiddle && data.middlePoints.length >= 2) {
        lineStrips.push({ points: data.middlePoints, width: BOLL_LINE_WIDTH, color: colors.boll.middle })
    }
    if (data.showLower && data.lowerPoints.length >= 2) {
        lineStrips.push({ points: data.lowerPoints, width: BOLL_LINE_WIDTH, color: colors.boll.lower })
    }

    if (lineStrips.length > 0) {
        allOk = surface.drawLineStrips(lineStrips, context.scrollLeft)
    }
    if (!allOk) {
        surface.clear()
        return false
    }

    compositeLineSurface(context, surface)
    surface.clear()
    return true
}

function buildPriceCacheKey(
    range: { start: number; end: number },
    dataLength: number,
    lastTimestamp: number,
    period: number
): string {
    return `${range.start}|${range.end}|${dataLength}|${lastTimestamp}|${period}`
}

function getBOLLStateKey(host: PluginHost | null): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn('[BOLLRenderer] Scheduler not available via service locator')
        return null
    }
    const meta = scheduler.getIndicatorMetadata('boll')
    if (!meta) {
        console.warn('[BOLLRenderer] Indicator metadata for \'boll\' not found, skip rendering')
        return null
    }
    return resolveStateKey(meta.stateKey)
}

const computeBOLLPriceRange: IndicatorPriceRangeComputer = (bundle, range) => {
    const series = bundle.boll.series
    if (series.length === 0 || range.start >= series.length) {
        return null
    }

    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const p = series[i]
        if (p) {
            min = Math.min(min, p.upper, p.middle, p.lower)
            max = Math.max(max, p.upper, p.middle, p.lower)
        }
    }

    return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null
}

const composeBOLLRenderState: IndicatorRenderStateComposer = (bundle, range, timestamp): BOLLRenderState => {
    const priceRange = computeBOLLPriceRange(bundle, range) ?? { min: Infinity, max: -Infinity }
    return {
        timestamp,
        series: bundle.boll.series,
        params: bundle.boll.params,
        visibleMin: priceRange.min,
        visibleMax: priceRange.max,
    }
}

@Indicator({
    name: 'boll',
    displayName: 'BOLL',
    category: 'main',
    stateKey: BOLL_STATE_KEY,
    defaultPaneId: 'main',
    mainPane: {
        rendererName: 'boll',
        toActiveConfig: (params, active) => active
            ? params
            : { ...params, showUpper: false, showMiddle: false, showLower: false, showBand: false },
        computePriceRange: computeBOLLPriceRange,
        composeRenderState: composeBOLLRenderState,
    },
    updateConfig: (scheduler, params) => {
        (scheduler as IndicatorScheduler).updateBOLLConfig(params as Partial<BOLLSchedulerConfig>)
    },
    semantic: {
        apply: (chart, indicator) => {
            const params = (indicator as { params?: { period?: number; multiplier?: number } }).params
            chart.updateRendererConfig('boll', {
                period: params?.period || 20,
                multiplier: params?.multiplier || 2,
            })
        },
    },
    applyResult: (host, state, _paneId) => {
        host.setSharedState(BOLL_STATE_KEY, state as any, 'indicator_scheduler')
    },
})
class BOLLDefinition {
    static rendererFactory = createBOLLRendererPlugin
}

export function createBOLLRendererPlugin(): RendererPluginWithHost {
    let pluginHost: PluginHost | null = null

    // 对象池：复用 {x,y} 对象，消除每帧 GC 压力
    const _upperPool: LinePoint[] = []
    const _middlePool: LinePoint[] = []
    const _lowerPool: LinePoint[] = []
    const _bandUpperPool: LinePoint[] = []
    const _bandLowerPool: LinePoint[] = []
    let _poolSize = 0

    function _growPool(size: number) {
        if (size <= _poolSize) return
        for (let i = _poolSize; i < size; i++) {
            _upperPool[i] = { x: 0, y: 0 }
            _middlePool[i] = { x: 0, y: 0 }
            _lowerPool[i] = { x: 0, y: 0 }
            _bandUpperPool[i] = { x: 0, y: 0 }
            _bandLowerPool[i] = { x: 0, y: 0 }
        }
        _poolSize = size
    }

    function resolveKey(): string | null {
        return getBOLLStateKey(pluginHost)
    }

    return {
        name: 'boll',
        version: '2.2.0',
        description: '布林带渲染器（无缓存优化）',
        debugName: 'BOLL布林带',
        paneId: 'main',
        priority: RENDERER_PRIORITY.INDICATOR,

        onInstall(host: PluginHost): void {
            pluginHost = host
        },

        getDeclaredNamespaces(): string[] {
            const key = resolveKey()
            return key ? [key] : []
        },

        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, dpr, kLineCenters } = context
            const klineData = data as KLineData[]
            const colors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)

            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<BOLLRenderState>(stateKey)
            if (!state || state.visibleMin > state.visibleMax || state.series.length === 0) {
                return
            }

            const { period, showUpper, showMiddle, showLower, showBand } = state.params
            const bollData = state.series

            if (klineData.length < period) return

            const drawStart = Math.max(range.start, period - 1)
            const drawEnd = Math.min(range.end, klineData.length)
            if (drawEnd <= drawStart) return

            // ====== 复用池对象，零分配构建点集 ======
            const rangeStart = range.start
            const priceToY = pane.yAxis.priceToY.bind(pane.yAxis)

            const pointCount = drawEnd - drawStart
            _growPool(pointCount)

            // 新数组作为 WebGL geoCache key（避免缓存命中旧数据）
            const upperPoints: LinePoint[] = new Array(pointCount)
            const middlePoints: LinePoint[] = new Array(pointCount)
            const lowerPoints: LinePoint[] = new Array(pointCount)
            const bandUpperPoints: LinePoint[] = showBand ? new Array(pointCount) : []
            const bandLowerPoints: LinePoint[] = showBand ? new Array(pointCount) : []

            let upperIdx = 0, middleIdx = 0, lowerIdx = 0, bandIdx = 0

            for (let i = drawStart; i < drawEnd; i++) {
                const boll = bollData[i]
                if (!boll) continue

                const centerX = kLineCenters[i - rangeStart]
                if (centerX === undefined) continue

                // 坐标转换
                const upperY = alignToPhysicalPixelCenter(priceToY(boll.upper), dpr)
                const middleY = alignToPhysicalPixelCenter(priceToY(boll.middle), dpr)
                const lowerY = alignToPhysicalPixelCenter(priceToY(boll.lower), dpr)

                // 从池中取对象，只改坐标，零分配
                let p = _upperPool[upperIdx]; p.x = centerX; p.y = upperY
                upperPoints[upperIdx++] = p
                p = _middlePool[middleIdx]; p.x = centerX; p.y = middleY
                middlePoints[middleIdx++] = p
                p = _lowerPool[lowerIdx]; p.x = centerX; p.y = lowerY
                lowerPoints[lowerIdx++] = p

                if (showBand) {
                    p = _bandUpperPool[bandIdx]; p.x = centerX; p.y = upperY
                    bandUpperPoints[bandIdx] = p
                    p = _bandLowerPool[bandIdx]; p.x = centerX; p.y = lowerY
                    bandLowerPoints[bandIdx] = p
                    bandIdx++
                }
            }

            // 截断到实际长度
            upperPoints.length = upperIdx
            middlePoints.length = middleIdx
            lowerPoints.length = lowerIdx
            if (showBand) {
                bandUpperPoints.length = bandIdx
                bandLowerPoints.length = bandIdx
            }

            // ====== 渲染 ======
            if (drawBOLLWithWebGL(context, {
                showUpper, showMiddle, showLower, showBand,
                upperPoints, middlePoints, lowerPoints,
                bandUpperPoints, bandLowerPoints,
            })) {
                return
            }

            // ====== Canvas 2D 回退（极少执行） ======
            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.lineWidth = BOLL_LINE_WIDTH
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'

            if (showBand && bandUpperPoints.length >= 2) {
                const bandPath = new Path2D()
                bandPath.moveTo(bandUpperPoints[0].x, bandUpperPoints[0].y)
                for (let i = 1; i < bandUpperPoints.length; i++) {
                    bandPath.lineTo(bandUpperPoints[i].x, bandUpperPoints[i].y)
                }
                for (let i = bandLowerPoints.length - 1; i >= 0; i--) {
                    bandPath.lineTo(bandLowerPoints[i].x, bandLowerPoints[i].y)
                }
                bandPath.closePath()
                ctx.fillStyle = colors.boll.bandFill
                ctx.fill(bandPath)
            }

            const drawLine = (points: LinePoint[], color: string) => {
                if (points.length < 2) return
                ctx.beginPath()
                ctx.strokeStyle = color
                ctx.moveTo(points[0].x, points[0].y)
                for (let i = 1; i < points.length; i++) {
                    ctx.lineTo(points[i].x, points[i].y)
                }
                ctx.stroke()
            }

            if (showUpper) drawLine(upperPoints, colors.boll.upper)
            if (showMiddle) drawLine(middlePoints, colors.boll.middle)
            if (showLower) drawLine(lowerPoints, colors.boll.lower)

            ctx.restore()
        },

        getConfig() {
            const stateKey = resolveKey()
            if (!stateKey) return {}
            const state = pluginHost?.getSharedState<BOLLRenderState>(stateKey)
            return state ? { ...state.params } : {}
        },

        setConfig(_newConfig: Record<string, unknown>) {
            // 外部控制器应调用 chart.getIndicatorScheduler().updateBOLLConfig()
        },
    }
}
