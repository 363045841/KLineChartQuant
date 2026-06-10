import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import { resolveThemeColors } from '../../../tokens'
import { alignToPhysicalPixelCenter } from '../../draw/pixelAlign'
import type { MOMRenderState } from '../../indicators/momState'
import { createMOMStateKey } from '../../indicators/momState'
import { EMPTY_MOM_STATE } from '../../indicators/momState'
import { createPaddedSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, MOMSchedulerConfig } from '../../indicators/scheduler'
import { createMomScaleRendererPlugin } from './scale/mom_scale'
import { calcMOMData } from '../../indicators/calculators'
import type { KLineData } from '../../../types/price'

type LinePoint = { x: number; y: number }

export interface MOMRendererOptions {
    /** 目标 pane ID（默认 'sub'） */
    paneId?: string
}

function getMOMStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn('[MOMRenderer] Scheduler not available via service locator')
        return null
    }
    const meta = scheduler.getIndicatorMetadata('mom')
    if (!meta) {
        console.warn("[MOMRenderer] Indicator metadata for 'mom' not found, skip rendering")
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

/**
 * 创建 MOM 渲染器插件
 */
export function createMOMRendererPlugin(options: MOMRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getMOMStateKey(pluginHost, paneId)
    }

    // 线条点缓存
    let cachedKey = ''
    let cachedMOMPoints: LinePoint[] = []

    // 离屏 Canvas 缓存零轴
    let offscreenCanvas: HTMLCanvasElement | null = null
    let offscreenCtx: CanvasRenderingContext2D | null = null
    let cachedZeroLineKey = ''

    function clearLineCache() {
        cachedKey = ''
        cachedMOMPoints = []
    }

    function getOffscreenCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
        if (!offscreenCanvas || offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
            offscreenCanvas = document.createElement('canvas')
            offscreenCanvas.width = width
            offscreenCanvas.height = height
            offscreenCtx = offscreenCanvas.getContext('2d')!
            cachedZeroLineKey = ''
        }
        return { canvas: offscreenCanvas, ctx: offscreenCtx! }
    }

    function buildZeroLineKey(
        paneWidth: number,
        paneHeight: number,
        displayMin: number,
        displayMax: number,
        dpr: number
    ): string {
        return `${paneWidth}|${paneHeight}|${displayMin.toFixed(4)}|${displayMax.toFixed(4)}|${dpr}`
    }

    function renderZeroLineToOffscreen(
        ctx: CanvasRenderingContext2D,
        paneWidth: number,
        paneHeight: number,
        displayMin: number,
        displayMax: number,
        dpr: number,
        colors: { mom: { zero: string } }
    ): void {
        const displayValueRange = displayMax - displayMin || 1
        const zeroY = alignToPhysicalPixelCenter(paneHeight - (0 - displayMin) / displayValueRange * paneHeight, dpr)

        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
        ctx.save()
        ctx.scale(dpr, dpr)
        ctx.strokeStyle = colors.mom.zero
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, zeroY)
        ctx.lineTo(paneWidth, zeroY)
        ctx.stroke()
        ctx.restore()
    }

    function buildMOMCacheKey(
        range: { start: number; end: number },
        kLineCenters: number[],
        pane: RenderContext['pane'],
        params: MOMRenderState['params'],
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
            params.showMOM,
            params.period,
        ].join('|')
    }

    return {
        name: `mom_${paneId}`,
        version: '2.1.0',
        description: 'MOM 动量指标渲染器（WebGL + Canvas2D 回退）',
        debugName: 'MOM',
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
            const state = pluginHost?.getSharedState<MOMRenderState>(stateKey)
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
            const zeroLineKey = buildZeroLineKey(paneWidth, paneHeight, displayMin, displayMax, dpr)

            if (cachedZeroLineKey !== zeroLineKey) {
                cachedZeroLineKey = zeroLineKey
                const { ctx: offCtx } = getOffscreenCanvas(
                    Math.ceil(paneWidth * dpr),
                    Math.ceil(paneHeight * dpr)
                )
                renderZeroLineToOffscreen(offCtx, paneWidth, paneHeight, displayMin, displayMax, dpr, colors)
            }

            if (offscreenCanvas) {
                ctx.drawImage(offscreenCanvas, 0, 0, paneWidth, paneHeight)
            }

            // 确定绘制范围
            const drawStart = Math.max(range.start, params.period)
            const drawEnd = Math.min(range.end, series.length)

            // 更新线条缓存
            const cacheKey = buildMOMCacheKey(range, kLineCenters, pane, params, state.timestamp)
            if (cachedKey !== cacheKey) {
                cachedKey = cacheKey

                const paneH = paneHeight
                const invRange = paneH / displayValueRange
                const rangeStart = range.start

                if (params.showMOM) {
                    const points: LinePoint[] = []
                    for (let i = drawStart; i < drawEnd; i++) {
                        const value = series[i]
                        if (value === undefined) continue

                        const centerX = kLineCenters[i - rangeStart]
                        if (centerX === undefined) continue

                        points.push({ x: centerX, y: paneH - (value - displayMin) * invRange })
                    }
                    cachedMOMPoints = points
                } else {
                    cachedMOMPoints = []
                }
            }

            // 绘制 MOM 线（WebGL 优先，Canvas2D 回退）
            const enableWebGL = context.settings?.enableWebGLRendering !== false
            let usedWebGL = false
            if (enableWebGL && lineWebGLSurface?.isAvailable()) {
                if (params.showMOM && cachedMOMPoints.length >= 2) {
                    const ok = lineWebGLSurface.drawLineStrips(
                        [{ points: cachedMOMPoints, width: 1, color: colors.mom.mom }],
                        scrollLeft
                    )
                    if (ok) {
                        usedWebGL = true
                        lineWebGLSurface.compositeTo(ctx, { imageSmoothingEnabled: false })
                    }
                }
            }

            if (!usedWebGL) {
                drawMOMLineWithCanvas2D(ctx, scrollLeft, cachedMOMPoints, params, colors)
            }
        },

        getConfig() {
            const stateKey = resolveKey()
            if (!stateKey) return {}
            const state = pluginHost?.getSharedState<MOMRenderState>(stateKey)
            return state?.params ?? {}
        },

        setConfig() {
            // no-op: 配置通过 scheduler.updateIndicatorConfig() 更新
        },
    }
}

/**
 * 使用 Canvas 2D 绘制 MOM 线（WebGL 回退）
 */
function drawMOMLineWithCanvas2D(
    ctx: CanvasRenderingContext2D,
    scrollLeft: number,
    momPoints: LinePoint[],
    params: { showMOM: boolean },
    colors: { mom: { mom: string } }
): void {
    if (!params.showMOM || momPoints.length < 2) return

    ctx.save()
    ctx.translate(-scrollLeft, 0)
    ctx.strokeStyle = colors.mom.mom
    ctx.lineWidth = 1
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(momPoints[0]!.x, momPoints[0]!.y)
    for (let i = 1; i < momPoints.length; i++) {
        const point = momPoints[i]!
        ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
    ctx.restore()
}

/**
 * 获取 MOM 标题信息（供 paneTitle 使用）
 */
export function getMOMTitleInfo(
    _data: KLineData[],
    index: number | null,
    params: Record<string, number | boolean | string>,
    pluginHost: PluginHost,
    paneId: string,
): { name: string; params: number[]; values: Array<{ label: string; value: number; color: string }> } | null {
    if (index === null) return null
    const period = (params.period as number) ?? 10
    const colors = resolveThemeColors('light')
    const state = pluginHost.getSharedState<MOMRenderState>(createMOMStateKey(paneId))
    if (!state) return null

    const mom = state.series[index]
    if (mom === undefined) return null

    return {
        name: 'MOM',
        params: [period],
        values: [
            { label: 'MOM', value: mom, color: colors.mom.mom },
        ],
    }
}

@Indicator({
    name: 'mom',
    displayName: 'MOM',
    category: 'oscillator',
    defaultPaneId: 'sub_MOM',
    scaleRendererFactory: createMomScaleRendererPlugin,
    visibleState: { compose: createPaddedSparseVisibleStateComposer('mom', EMPTY_MOM_STATE) },
    getTitleInfo: getMOMTitleInfo,
    runtime: {
        defaultConfig: { period: 10, showMOM: true },
        computeKey: 'calcMOMData',
        compute: (data, c) => calcMOMData(data, c.period),
    },
})
class MOMIndicatorDefinition {
    static rendererFactory = createMOMRendererPlugin
}
