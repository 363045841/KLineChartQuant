import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import { resolveThemeColors } from '../../../tokens'
import { alignToPhysicalPixelCenter } from '../../draw/pixelAlign'
import type { STOCHRenderState } from '../../indicators/stochState'
import { createSTOCHStateKey, EMPTY_STOCH_STATE } from '../../indicators/stochState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { createFixedRangePointVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, STOCHSchedulerConfig } from '../../indicators/scheduler'
import { createStochScaleRendererPlugin } from './scale/stoch_scale'
import { calcSTOCHData } from '../../indicators/calculators'
import type { KLineData } from '../../../types/price'

type LinePoint = { x: number; y: number }

export interface STOCHRendererOptions {
    /** 目标 pane ID（默认 'sub'） */
    paneId?: string
}

function getSTOCHStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn('[STOCHRenderer] Scheduler not available via service locator')
        return null
    }
    const meta = scheduler.getIndicatorMetadata('stoch')
    if (!meta) {
        console.warn("[STOCHRenderer] Indicator metadata for 'stoch' not found, skip rendering")
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

/**
 * 创建 STOCH 渲染器插件
 */
export function createSTOCHRendererPlugin(options: STOCHRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getSTOCHStateKey(pluginHost, paneId)
    }

    // 线条点缓存
    let cachedKey = ''
    let cachedKPoints: LinePoint[] = []
    let cachedDPoints: LinePoint[] = []

    // 离屏 Canvas 缓存虚线背景线 (80/20)
    let offscreenCanvas: HTMLCanvasElement | null = null
    let offscreenCtx: CanvasRenderingContext2D | null = null
    let cachedDashedLinesKey = ''

    function clearLineCache() {
        cachedKey = ''
        cachedKPoints = []
        cachedDPoints = []
    }

    function getOffscreenCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
        if (!offscreenCanvas || offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
            offscreenCanvas = document.createElement('canvas')
            offscreenCanvas.width = width
            offscreenCanvas.height = height
            offscreenCtx = offscreenCanvas.getContext('2d')!
            cachedDashedLinesKey = ''
        }
        return { canvas: offscreenCanvas, ctx: offscreenCtx! }
    }

    function buildDashedLinesKey(
        paneWidth: number,
        paneHeight: number,
        displayMin: number,
        displayMax: number,
        dpr: number
    ): string {
        return `${paneWidth}|${paneHeight}|${displayMin.toFixed(4)}|${displayMax.toFixed(4)}|${dpr}`
    }

    function renderDashedLinesToOffscreen(
        ctx: CanvasRenderingContext2D,
        paneWidth: number,
        paneHeight: number,
        displayMin: number,
        displayMax: number,
        dpr: number
    ): void {
        const displayValueRange = displayMax - displayMin || 1
        const y80 = alignToPhysicalPixelCenter(paneHeight - (80 - displayMin) / displayValueRange * paneHeight, dpr)
        const y20 = alignToPhysicalPixelCenter(paneHeight - (20 - displayMin) / displayValueRange * paneHeight, dpr)

        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
        ctx.save()
        ctx.scale(dpr, dpr)

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(0, y80)
        ctx.lineTo(paneWidth, y80)
        ctx.moveTo(0, y20)
        ctx.lineTo(paneWidth, y20)
        ctx.stroke()

        ctx.restore()
    }

    function buildSTOCHCacheKey(
        range: { start: number; end: number },
        kLineCenters: number[],
        pane: RenderContext['pane'],
        params: STOCHRenderState['params'],
        stateTimestamp: number
    ): string {
        const dr = pane.yAxis.getDisplayRange()
        return [
            stateTimestamp,
            range.start,
            range.end,
            kLineCenters.length,
            kLineCenters[0]?.toFixed(2) ?? 'n',
            kLineCenters[kLineCenters.length - 1]?.toFixed(2) ?? 'n',
            dr.maxPrice.toFixed(6),
            dr.minPrice.toFixed(6),
            pane.yAxis.getPriceOffset().toFixed(6),
            pane.yAxis.getScaleType(),
            pane.height.toFixed(2),
            params.showK,
            params.showD,
            params.n,
            params.m,
        ].join('|')
    }

    return {
        name: `stoch_${paneId}`,
        version: '2.1.0',
        description: 'STOCH 随机指标渲染器（WebGL + Canvas2D 回退）',
        debugName: 'STOCH',
        paneId: paneId,
        priority: RENDERER_PRIORITY.MAIN,

        onInstall(host: PluginHost) {
            pluginHost = host
        },

        getDeclaredNamespaces() {
            const key = resolveKey()
            return key ? [key] : []
        },

        draw(context: RenderContext) {
const { ctx, pane, range, scrollLeft, dpr, kLineCenters, lineWebGLSurface } = context
            const colors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)

            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<STOCHRenderState>(stateKey)
            if (!state || state.visibleMin > state.visibleMax) {
                clearLineCache()
                return
            }

            const { valueMin, valueMax, params, series } = state

            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayMax = displayRange.maxPrice
            const displayValueRange = displayMax - displayMin || 1

            const paneWidth = context.paneWidth
            const paneHeight = pane.height
            const dashedLinesKey = buildDashedLinesKey(paneWidth, paneHeight, displayMin, displayMax, dpr)

            if (cachedDashedLinesKey !== dashedLinesKey) {
                cachedDashedLinesKey = dashedLinesKey
                const { ctx: offCtx } = getOffscreenCanvas(
                    Math.ceil(paneWidth * dpr),
                    Math.ceil(paneHeight * dpr)
                )
                renderDashedLinesToOffscreen(offCtx, paneWidth, paneHeight, displayMin, displayMax, dpr)
            }

            if (offscreenCanvas) {
                ctx.drawImage(offscreenCanvas, 0, 0, paneWidth, paneHeight)
            }

            // 确定绘制范围
            const drawStart = Math.max(range.start, params.n + params.m - 2)
            const drawEnd = Math.min(range.end, series.length)

            // 更新线条缓存
            const cacheKey = buildSTOCHCacheKey(range, kLineCenters, pane, params, state.timestamp)
            if (cachedKey !== cacheKey) {
                cachedKey = cacheKey

                const paneH = paneHeight
                const invRange = paneH / displayValueRange
                const rangeStart = range.start

                if (params.showK) {
                    const points: LinePoint[] = []
                    for (let i = drawStart; i < drawEnd; i++) {
                        const point = series[i]
                        if (!point) continue

                        const centerX = kLineCenters[i - rangeStart]
                        if (centerX === undefined) continue

                        points.push({ x: centerX, y: paneH - (point.k - displayMin) * invRange })
                    }
                    cachedKPoints = points
                } else {
                    cachedKPoints = []
                }

                if (params.showD) {
                    const points: LinePoint[] = []
                    for (let i = drawStart; i < drawEnd; i++) {
                        const point = series[i]
                        if (!point) continue

                        const centerX = kLineCenters[i - rangeStart]
                        if (centerX === undefined) continue

                        points.push({ x: centerX, y: paneH - (point.d - displayMin) * invRange })
                    }
                    cachedDPoints = points
                } else {
                    cachedDPoints = []
                }
            }

            // 绘制 STOCH 线（WebGL 优先，Canvas2D 回退）
            const enableWebGL = context.settings?.enableWebGLRendering !== false
            let usedWebGL = false
            if (enableWebGL && lineWebGLSurface?.isAvailable()) {
                const lines: Array<{ points: LinePoint[]; width: number; color: string }> = []
                if (params.showK && cachedKPoints.length >= 2) {
                    lines.push({ points: cachedKPoints, width: 1, color: colors.kdj.k })
                }
                if (params.showD && cachedDPoints.length >= 2) {
                    lines.push({ points: cachedDPoints, width: 1, color: colors.kdj.d })
                }

                const allOk = lines.length > 0 && lineWebGLSurface.drawLineStrips(lines, scrollLeft)

                if (allOk) {
                    usedWebGL = true
                    lineWebGLSurface.compositeTo(ctx, { imageSmoothingEnabled: false })
                }
            }

            if (!usedWebGL) {
                drawSTOCHLinesWithCanvas2D(ctx, scrollLeft, cachedKPoints, cachedDPoints, params, colors)
            }
        },

        getConfig() {
            const stateKey = resolveKey()
            if (!stateKey) return {}
            const state = pluginHost?.getSharedState<STOCHRenderState>(stateKey)
            return state?.params ?? {}
        },

        setConfig() {
            // no-op: 配置通过 scheduler.updateIndicatorConfig() 更新
        },
    }
}

/**
 * 使用 Canvas 2D 绘制 STOCH 线（WebGL 回退）
 */
function drawSTOCHLinesWithCanvas2D(
    ctx: CanvasRenderingContext2D,
    scrollLeft: number,
    kPoints: LinePoint[],
    dPoints: LinePoint[],
    params: { showK: boolean; showD: boolean },
    colors: { kdj: { k: string; d: string } }
): void {
    ctx.save()
    ctx.translate(-scrollLeft, 0)
    ctx.lineWidth = 1
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    if (params.showK && kPoints.length >= 2) {
        ctx.strokeStyle = colors.kdj.k
        ctx.beginPath()
        ctx.moveTo(kPoints[0]!.x, kPoints[0]!.y)
        for (let i = 1; i < kPoints.length; i++) {
            const point = kPoints[i]!
            ctx.lineTo(point.x, point.y)
        }
        ctx.stroke()
    }

    if (params.showD && dPoints.length >= 2) {
        ctx.strokeStyle = colors.kdj.d
        ctx.beginPath()
        ctx.moveTo(dPoints[0]!.x, dPoints[0]!.y)
        for (let i = 1; i < dPoints.length; i++) {
            const point = dPoints[i]!
            ctx.lineTo(point.x, point.y)
        }
        ctx.stroke()
    }

    ctx.restore()
}

/**
 * 获取 STOCH 标题信息（供 paneTitle 使用）
 */
export function getSTOCHTitleInfo(
    _data: KLineData[],
    index: number | null,
    params: Record<string, number | boolean | string>,
    pluginHost: PluginHost,
    paneId: string,
): { name: string; params: number[]; values: Array<{ label: string; value: number; color: string }> } | null {
    if (index === null) return null
    const n = (params.n as number) ?? 9
    const m = (params.m as number) ?? 3
    const colors = resolveThemeColors('light')
    const state = pluginHost.getSharedState<STOCHRenderState>(createSTOCHStateKey(paneId))
    if (!state) return null

    const point = state.series[index]
    if (!point || point.k === undefined) return null

    const values = []
    if (state.params.showK) values.push({ label: 'K', value: point.k, color: colors.kdj.k })
    if (state.params.showD) values.push({ label: 'D', value: point.d, color: colors.kdj.d })

    if (values.length === 0) return null

    return {
        name: 'STOCH',
        params: [n, m],
        values,
    }
}

@Indicator({
    name: 'stoch',
    displayName: 'STOCH',
    category: 'oscillator',
    defaultPaneId: 'sub_STOCH',
    visibleState: { compose: createFixedRangePointVisibleStateComposer('stoch', EMPTY_STOCH_STATE, ['k', 'd'] as const) },
    scaleRendererFactory: createStochScaleRendererPlugin,
    getTitleInfo: getSTOCHTitleInfo,
    runtime: { defaultConfig:{n:9,m:3,showK:true,showD:true}, computeKey:'calcSTOCHData', compute:(data,c)=>calcSTOCHData(data,c.n,c.m) },
})
class STOCHIndicatorDefinition {
    static rendererFactory = createSTOCHRendererPlugin
}
