import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import { resolveThemeColors } from '../../../tokens'
import { alignToPhysicalPixelCenter } from '../../draw/pixelAlign'
import type { FASTKRenderState } from '../../indicators/fastkState'
import { createFASTKStateKey } from '../../indicators/fastkState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../../indicators/scheduler'

type LinePoint = { x: number; y: number }

export interface FASTKRendererOptions {
    /** 目标 pane ID（默认 'sub'） */
    paneId?: string
}

function getFASTKStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn('[FASTKRenderer] Scheduler not available via service locator')
        return null
    }
    const meta = scheduler.getIndicatorMetadata('fastk')
    if (!meta) {
        console.warn("[FASTKRenderer] Indicator metadata for 'fastk' not found, skip rendering")
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

/**
 * 创建 FASTK 渲染器插件
 */
export function createFASTKRendererPlugin(options: FASTKRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getFASTKStateKey(pluginHost, paneId)
    }

    // 线条点缓存
    let cachedKey = ''
    let cachedFASTKPoints: LinePoint[] = []

    // 离屏 Canvas 缓存虚线背景线 (80/20)
    let offscreenCanvas: HTMLCanvasElement | null = null
    let offscreenCtx: CanvasRenderingContext2D | null = null
    let cachedDashedLinesKey = ''

    function clearLineCache() {
        cachedKey = ''
        cachedFASTKPoints = []
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

    function buildFASTKCacheKey(
        range: { start: number; end: number },
        kLineCenters: number[],
        pane: RenderContext['pane'],
        params: FASTKRenderState['params'],
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
            params.showFASTK,
            params.period,
        ].join('|')
    }

    return {
        name: `fastk_${paneId}`,
        version: '2.1.0',
        description: 'FASTK 快速随机指标渲染器（WebGL + Canvas2D 回退）',
        debugName: 'FASTK',
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
            const state = pluginHost?.getSharedState<FASTKRenderState>(stateKey)
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
            const drawStart = Math.max(range.start, params.period - 1)
            const drawEnd = Math.min(range.end, series.length)

            // 更新线条缓存
            const cacheKey = buildFASTKCacheKey(range, kLineCenters, pane, params, state.timestamp)
            if (cachedKey !== cacheKey) {
                cachedKey = cacheKey

                const paneH = paneHeight
                const invRange = paneH / displayValueRange
                const rangeStart = range.start

                if (params.showFASTK) {
                    const points: LinePoint[] = []
                    for (let i = drawStart; i < drawEnd; i++) {
                        const value = series[i]
                        if (value === undefined) continue

                        const centerX = kLineCenters[i - rangeStart]
                        if (centerX === undefined) continue

                        points.push({ x: centerX, y: paneH - (value - displayMin) * invRange })
                    }
                    cachedFASTKPoints = points
                } else {
                    cachedFASTKPoints = []
                }
            }

            // 绘制 FASTK 线（WebGL 优先，Canvas2D 回退）
            const enableWebGL = context.settings?.enableWebGLRendering !== false
            let usedWebGL = false
            if (enableWebGL && lineWebGLSurface?.isAvailable()) {
                if (params.showFASTK && cachedFASTKPoints.length >= 2) {
                    const ok = lineWebGLSurface.drawLineStrips(
                        [{ points: cachedFASTKPoints, width: 1, color: colors.kdj.k }],
                        scrollLeft
                    )
                    if (ok) {
                        usedWebGL = true
                        lineWebGLSurface.compositeTo(ctx, { imageSmoothingEnabled: false })
                    }
                }
            }

            if (!usedWebGL) {
                drawFASTKLineWithCanvas2D(ctx, scrollLeft, cachedFASTKPoints, params, colors)
            }
        },

        getConfig() {
            const stateKey = resolveKey()
            if (!stateKey) return {}
            const state = pluginHost?.getSharedState<FASTKRenderState>(stateKey)
            return state?.params ?? {}
        },

        setConfig() {
            // no-op: 配置通过 scheduler.updateFASTKConfig() 更新
        },
    }
}

/**
 * 使用 Canvas 2D 绘制 FASTK 线（WebGL 回退）
 */
function drawFASTKLineWithCanvas2D(
    ctx: CanvasRenderingContext2D,
    scrollLeft: number,
    fastkPoints: LinePoint[],
    params: { showFASTK: boolean },
    colors: { kdj: { k: string } }
): void {
    if (!params.showFASTK || fastkPoints.length < 2) return

    ctx.save()
    ctx.translate(-scrollLeft, 0)
    ctx.strokeStyle = colors.kdj.k
    ctx.lineWidth = 1
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(fastkPoints[0]!.x, fastkPoints[0]!.y)
    for (let i = 1; i < fastkPoints.length; i++) {
        const point = fastkPoints[i]!
        ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
    ctx.restore()
}

/**
 * 获取 FASTK 标题信息（供 paneTitle 使用）
 */
export function getFASTKTitleInfo(
    index: number,
    period: number,
    pluginHost: PluginHost,
    paneId: string = 'sub_FASTK',
    theme: 'light' | 'dark' = 'light',
    isAsiaMarket?: boolean
): { name: string; params: number[]; values: Array<{ label: string; value: number; color: string }> } | null {
    const colors = resolveThemeColors(theme, isAsiaMarket)
    const state = pluginHost.getSharedState<FASTKRenderState>(createFASTKStateKey(paneId))
    if (!state) return null

    const fastk = state.series[index]
    if (fastk === undefined) return null

    return {
        name: 'FASTK',
        params: [period],
        values: [
            { label: 'FASTK', value: fastk, color: colors.kdj.k },
        ],
    }
}

@Indicator({
    name: 'fastk',
    displayName: 'FASTK',
    category: 'oscillator',
    stateKey: createFASTKStateKey,
    defaultPaneId: 'sub_FASTK',
    paneIdField: 'fastkPaneId',
    applyResult: (host, state, paneId) => {
        host.setSharedState(createFASTKStateKey(paneId), state as any, 'indicator_scheduler')
    },
})
class FASTKIndicatorDefinition {
    static rendererFactory = createFASTKRendererPlugin
}
