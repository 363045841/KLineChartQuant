import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { ATRRenderState } from '@/core/indicators/atrState'
import { createATRStateKey } from '@/core/indicators/atrState'

type LinePoint = { x: number; y: number }

const ATR_COLOR = '#d97706'

export interface ATRRendererOptions {
    paneId?: string
}

export function createATRRendererPlugin(options: ATRRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub_ATR' } = options
    const STATE_KEY = createATRStateKey(paneId)
    let pluginHost: PluginHost | null = null

    let cachedKey = ''
    let cachedPoints: LinePoint[] = []

    function clearCache() {
        cachedKey = ''
        cachedPoints = []
    }

    function buildCacheKey(
        range: { start: number; end: number },
        kLineCenters: number[],
        pane: RenderContext['pane'],
        params: ATRRenderState['params'],
    ): string {
        const dr = pane.yAxis.getDisplayRange()
        return [
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
            params.showATR,
            params.period,
        ].join('|')
    }

    return {
        name: `atr_${paneId}`,
        version: '1.0.0',
        description: 'ATR 平均真实波幅渲染器（Wilder 平滑）',
        debugName: 'ATR',
        paneId: paneId,
        priority: RENDERER_PRIORITY.MAIN,

        onInstall(host: PluginHost) {
            pluginHost = host
        },

        getDeclaredNamespaces() {
            return [STATE_KEY]
        },

        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters, lineWebGLSurface } = context

            const state = pluginHost?.getSharedState<ATRRenderState>(STATE_KEY)
            if (!state || !state.params.showATR || state.visibleMin > state.visibleMax) {
                clearCache()
                return
            }

            const { valueMin, valueMax, params, series } = state
            const valueRange = valueMax - valueMin || 1

            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayMax = displayRange.maxPrice
            const displayValueRange = displayMax - displayMin || 1

            // 基线（ATR 最低永远 ≥ 0，画 0 线作为参考）
            const zeroY = pane.height - (0 - displayMin) / displayValueRange * pane.height

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

            // 绘制范围
            const drawStart = Math.max(range.start, params.period - 1)
            const drawEnd = Math.min(range.end, series.length)

            const cacheKey = buildCacheKey(range, kLineCenters, pane, params)
            if (cachedKey !== cacheKey) {
                cachedKey = cacheKey
                cachedPoints = []

                for (let i = drawStart; i < drawEnd; i++) {
                    const value = series[i]
                    if (value === undefined) continue
                    const centerX = kLineCenters[i - range.start]
                    if (centerX === undefined) continue

                    const logicY = pane.height - (value - displayMin) / displayValueRange * pane.height
                    cachedPoints.push({ x: centerX, y: logicY })
                }
            }

            const enableWebGL = context.settings?.enableWebGLRendering !== false
            let usedWebGL = false
            if (enableWebGL && lineWebGLSurface?.isAvailable()) {
                if (cachedPoints.length >= 2) {
                    const ok = lineWebGLSurface.drawLineStrips(
                        [{ points: cachedPoints, width: 1, color: ATR_COLOR }],
                        scrollLeft,
                    )
                    if (ok) {
                        usedWebGL = true
                        lineWebGLSurface.compositeTo(ctx, { imageSmoothingEnabled: false })
                    }
                }
            }

            if (!usedWebGL) {
                drawWithCanvas2D(ctx, scrollLeft, cachedPoints)
            }
        },

        getConfig() {
            const state = pluginHost?.getSharedState<ATRRenderState>(STATE_KEY)
            return state?.params ?? {}
        },

        setConfig() {
            // no-op: 配置通过 scheduler.updateATRConfig() 更新
        },
    }
}

function drawWithCanvas2D(
    ctx: CanvasRenderingContext2D,
    scrollLeft: number,
    points: LinePoint[],
): void {
    if (points.length < 2) return
    ctx.save()
    ctx.translate(-scrollLeft, 0)
    ctx.strokeStyle = ATR_COLOR
    ctx.lineWidth = 1
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(points[0]!.x, points[0]!.y)
    for (let i = 1; i < points.length; i++) {
        const point = points[i]!
        ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
    ctx.restore()
}

/**
 * 获取 ATR 标题信息（供 paneTitle 使用）
 */
export function getATRTitleInfo(
    index: number,
    period: number,
    pluginHost: PluginHost,
    paneId: string = 'sub_ATR',
): { name: string; params: number[]; values: Array<{ label: string; value: number; color: string }> } | null {
    const state = pluginHost.getSharedState<ATRRenderState>(createATRStateKey(paneId))
    if (!state) return null

    const atr = state.series[index]
    if (atr === undefined) return null

    return {
        name: 'ATR',
        params: [period],
        values: [
            { label: 'ATR', value: atr, color: ATR_COLOR },
        ],
    }
}
