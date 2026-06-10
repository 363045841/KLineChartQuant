import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import { resolveThemeColors } from '../../../tokens'
import { alignToPhysicalPixelCenter } from '../../draw/pixelAlign'
import type { RSIRenderState } from '../../indicators/rsiState'
import { createRSIStateKey, EMPTY_RSI_STATE } from '../../indicators/rsiState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { createFixedRangeRecordVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, RSISchedulerConfig } from '../../indicators/scheduler'
import { createRsiScaleRendererPlugin } from './scale/rsi_scale'
import { calcRSIData } from '../../indicators/calculators'
import type { KLineData } from '../../../types/price'

type LinePoint = { x: number; y: number }

export interface RSIRendererOptions {
    /** 目标 pane ID（默认 'sub'） */
    paneId?: string
}

function getRSIStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn('[RSIRenderer] Scheduler not available via service locator')
        return null
    }
    const meta = scheduler.getIndicatorMetadata('rsi')
    if (!meta) {
        console.warn("[RSIRenderer] Indicator metadata for 'rsi' not found, skip rendering")
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

/**
 * 创建 RSI 渲染器插件
 */
export function createRSIRendererPlugin(options: RSIRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getRSIStateKey(pluginHost, paneId)
    }

    // 线条点缓存
    let cachedKey = ''
    let cachedRSI1Points: LinePoint[] = []
    let cachedRSI2Points: LinePoint[] = []
    let cachedRSI3Points: LinePoint[] = []

    // 离屏 Canvas 缓存虚线背景线 (80/50/20)
    let offscreenCanvas: HTMLCanvasElement | null = null
    let offscreenCtx: CanvasRenderingContext2D | null = null
    let cachedDashedLinesKey = ''

    function clearLineCache() {
        cachedKey = ''
        cachedRSI1Points = []
        cachedRSI2Points = []
        cachedRSI3Points = []
    }

    /**
     * 获取或创建离屏 Canvas
     */
    function getOffscreenCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
        if (!offscreenCanvas || offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
            offscreenCanvas = document.createElement('canvas')
            offscreenCanvas.width = width
            offscreenCanvas.height = height
            offscreenCtx = offscreenCanvas.getContext('2d')!
            cachedDashedLinesKey = '' // 尺寸变化时强制重绘
        }
        return { canvas: offscreenCanvas, ctx: offscreenCtx! }
    }

    /**
     * 生成虚线缓存 key - 只关心影响虚线外观的参数
     */
    function buildDashedLinesKey(
        paneWidth: number,
        paneHeight: number,
        displayMin: number,
        displayMax: number,
        dpr: number
    ): string {
        return `${paneWidth}|${paneHeight}|${displayMin.toFixed(4)}|${displayMax.toFixed(4)}|${dpr}`
    }

    /**
     * 绘制虚线背景线到离屏 Canvas
     */
    function renderDashedLinesToOffscreen(
        ctx: CanvasRenderingContext2D,
        paneWidth: number,
        paneHeight: number,
        displayMin: number,
        displayMax: number,
        dpr: number
    ): void {
        const displayValueRange = displayMax - displayMin || 1

        // 计算三条线的 Y 坐标
        const y80 = alignToPhysicalPixelCenter(paneHeight - (80 - displayMin) / displayValueRange * paneHeight, dpr)
        const y50 = alignToPhysicalPixelCenter(paneHeight - (50 - displayMin) / displayValueRange * paneHeight, dpr)
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
        ctx.moveTo(0, y50)
        ctx.lineTo(paneWidth, y50)
        ctx.moveTo(0, y20)
        ctx.lineTo(paneWidth, y20)
        ctx.stroke()

        ctx.restore()
    }

    function buildRSICacheKey(
        range: { start: number; end: number },
        kLineCenters: number[],
        pane: RenderContext['pane'],
        params: RSIRenderState['params'],
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
            params.showRSI1,
            params.showRSI2,
            params.showRSI3,
        ].join('|')
    }

    return {
        name: `rsi_${paneId}`,
        version: '2.1.0',
        description: 'RSI 相对强弱指标渲染器（WebGL + Canvas2D 回退）',
        debugName: 'RSI',
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

            // 从 StateStore 读取 RSI 状态
            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<RSIRenderState>(stateKey)

            // 无有效数据时跳过渲染
            if (!state || state.visibleMin > state.visibleMax) {
                clearLineCache()
                return
            }

            const { valueMin, valueMax, params, series } = state

            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayMax = displayRange.maxPrice
            const displayValueRange = displayMax - displayMin || 1

            // ========== 优化1: 使用离屏 Canvas 缓存虚线背景线 ==========
            const paneWidth = context.paneWidth
            const paneHeight = pane.height
            if (paneWidth <= 0 || paneHeight <= 0) {
                clearLineCache()
                return
            }
            const dashedLinesKey = buildDashedLinesKey(paneWidth, paneHeight, displayMin, displayMax, dpr)

            if (cachedDashedLinesKey !== dashedLinesKey) {
                cachedDashedLinesKey = dashedLinesKey
                const { ctx: offCtx } = getOffscreenCanvas(
                    Math.ceil(paneWidth * dpr),
                    Math.ceil(paneHeight * dpr)
                )
                renderDashedLinesToOffscreen(offCtx, paneWidth, paneHeight, displayMin, displayMax, dpr)
            }

            // 绘制离屏缓存的虚线（只需 drawImage，无需 setLineDash）
            if (offscreenCanvas) {
                ctx.drawImage(offscreenCanvas, 0, 0, paneWidth, paneHeight)
            }

            // 确定绘制范围
            const drawStart = Math.max(range.start, params.period1)
            const drawEnd = Math.min(range.end, kLineCenters.length + range.start)

            // 更新线条缓存
            const cacheKey = buildRSICacheKey(range, kLineCenters, pane, params, state.timestamp)
            if (cachedKey !== cacheKey) {
                cachedKey = cacheKey

                const paneH = paneHeight
                const invRange = paneH / displayValueRange
                const rangeStart = range.start

                const buildPoints = (data: (number | undefined)[]): LinePoint[] => {
                    const out: LinePoint[] = []
                    for (let i = drawStart; i < drawEnd; i++) {
                        const value = data[i]
                        if (value === undefined) continue
                        const centerX = kLineCenters[i - rangeStart]
                        if (centerX === undefined) continue
                        out.push({ x: centerX, y: paneH - (value - displayMin) * invRange })
                    }
                    return out
                }

                cachedRSI1Points = (params.showRSI1 && series[params.period1])
                    ? buildPoints(series[params.period1])
                    : []

                cachedRSI2Points = (params.showRSI2 && series[params.period2])
                    ? buildPoints(series[params.period2])
                    : []

                cachedRSI3Points = (params.showRSI3 && series[params.period3])
                    ? buildPoints(series[params.period3])
                    : []
            }

            // 绘制 RSI 线（WebGL 优先，Canvas2D 回退）
            const enableWebGL = context.settings?.enableWebGLRendering !== false
            let usedWebGL = false
            if (enableWebGL && lineWebGLSurface?.isAvailable()) {
                const lines: Array<{ points: LinePoint[]; width: number; color: string }> = []
                if (params.showRSI1 && cachedRSI1Points.length >= 2) {
                    lines.push({ points: cachedRSI1Points, width: 1, color: colors.rsi.rsi1 })
                }
                if (params.showRSI2 && cachedRSI2Points.length >= 2) {
                    lines.push({ points: cachedRSI2Points, width: 1, color: colors.rsi.rsi2 })
                }
                if (params.showRSI3 && cachedRSI3Points.length >= 2) {
                    lines.push({ points: cachedRSI3Points, width: 1, color: colors.rsi.rsi3 })
                }

                const allOk = lines.length > 0 && lineWebGLSurface.drawLineStrips(lines, scrollLeft)

                if (allOk) {
                    usedWebGL = true
                    lineWebGLSurface.compositeTo(ctx, { imageSmoothingEnabled: false })
                }
            }

            if (!usedWebGL) {
                drawRSILinesWithCanvas2D(ctx, scrollLeft, cachedRSI1Points, cachedRSI2Points, cachedRSI3Points, params, colors.rsi.rsi1, colors.rsi.rsi2, colors.rsi.rsi3)
            }
        },

        getConfig() {
            const stateKey = resolveKey()
            if (!stateKey) return {}
            const state = pluginHost?.getSharedState<RSIRenderState>(stateKey)
            return state ? { ...state.params } : {}
        },

        setConfig(_newConfig: Record<string, unknown>) {
            // 无状态渲染器：配置变更请使用 chart.getIndicatorScheduler().updateIndicatorConfig()
        },
    }
}

/**
 * 获取 RSI 标题信息（供 paneTitle 使用）
 * 从 StateStore 读取已计算的 RSI 数据
 */
export function drawRSILinesWithCanvas2D(
    ctx: CanvasRenderingContext2D,
    scrollLeft: number,
    rsi1Points: LinePoint[],
    rsi2Points: LinePoint[],
    rsi3Points: LinePoint[],
    params: { showRSI1: boolean; showRSI2: boolean; showRSI3: boolean },
    rsi1Color: string,
    rsi2Color: string,
    rsi3Color: string
): void {
    ctx.save()
    ctx.translate(-scrollLeft, 0)
    ctx.lineWidth = 1
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    if (params.showRSI1 && rsi1Points.length >= 2) {
        ctx.strokeStyle = rsi1Color
        ctx.beginPath()
        ctx.moveTo(rsi1Points[0]!.x, rsi1Points[0]!.y)
        for (let i = 1; i < rsi1Points.length; i++) {
            const point = rsi1Points[i]!
            ctx.lineTo(point.x, point.y)
        }
        ctx.stroke()
    }

    if (params.showRSI2 && rsi2Points.length >= 2) {
        ctx.strokeStyle = rsi2Color
        ctx.beginPath()
        ctx.moveTo(rsi2Points[0]!.x, rsi2Points[0]!.y)
        for (let i = 1; i < rsi2Points.length; i++) {
            const point = rsi2Points[i]!
            ctx.lineTo(point.x, point.y)
        }
        ctx.stroke()
    }

    if (params.showRSI3 && rsi3Points.length >= 2) {
        ctx.strokeStyle = rsi3Color
        ctx.beginPath()
        ctx.moveTo(rsi3Points[0]!.x, rsi3Points[0]!.y)
        for (let i = 1; i < rsi3Points.length; i++) {
            const point = rsi3Points[i]!
            ctx.lineTo(point.x, point.y)
        }
        ctx.stroke()
    }

    ctx.restore()
}

export function getRSITitleInfo(
    _data: KLineData[],
    index: number | null,
    params: Record<string, number | boolean | string>,
    pluginHost: PluginHost,
    paneId: string,
): { name: string; params: number[]; values: Array<{ label: string; value: number; color: string }> } | null {
    if (index === null) return null
    const period1 = (params.period1 as number) ?? 6
    const period2 = (params.period2 as number) ?? 12
    const period3 = (params.period3 as number) ?? 24
    const colors = resolveThemeColors('light')
    const stateKey = createRSIStateKey(paneId)
    const state = pluginHost.getSharedState<RSIRenderState>(stateKey)

    if (!state) return null

    const rsi1 = state.series[period1]?.[index]
    const rsi2 = state.series[period2]?.[index]
    const rsi3 = state.series[period3]?.[index]

    const values: Array<{ label: string; value: number; color: string }> = []
    if (rsi1 !== undefined) values.push({ label: `RSI${period1}`, value: rsi1, color: colors.rsi.rsi1 })
    if (rsi2 !== undefined) values.push({ label: `RSI${period2}`, value: rsi2, color: colors.rsi.rsi2 })
    if (rsi3 !== undefined) values.push({ label: `RSI${period3}`, value: rsi3, color: colors.rsi.rsi3 })

    if (values.length === 0) return null

    return {
        name: 'RSI',
        params: [period1, period2, period3],
        values,
    }
}

@Indicator({
    name: 'rsi',
    displayName: 'RSI',
    category: 'oscillator',
    defaultPaneId: 'sub_RSI',
    visibleState: { compose: createFixedRangeRecordVisibleStateComposer('rsi', EMPTY_RSI_STATE) },
    scaleRendererFactory: createRsiScaleRendererPlugin,
    getTitleInfo: getRSITitleInfo,
    runtime: { defaultConfig:{period1:6,period2:12,period3:24,showRSI1:true,showRSI2:true,showRSI3:true}, computeKey:'calcRSIData', compute:(data,c)=>{const p=[c.period1,c.period2,c.period3];const s=[c.showRSI1,c.showRSI2,c.showRSI3];const r:Record<number,(number|undefined)[]>={};for(let i=0;i<3;i++){if(s[i])r[p[i]]=calcRSIData(data,p[i])}return r} },
})
class RSIIndicatorDefinition {
    static rendererFactory = createRSIRendererPlugin
}
