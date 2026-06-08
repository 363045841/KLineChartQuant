import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import { resolveThemeColors } from '../../../tokens'
import type { KSTRenderState } from '../../indicators/kstState'
import { createKSTStateKey } from '../../indicators/kstState'
import { EMPTY_KST_STATE } from '../../indicators/kstState'
import { createPaddedPointVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, KSTSchedulerConfig } from '../../indicators/scheduler'
import { createKstScaleRendererPlugin } from './scale/kst_scale'

type LinePoint = { x: number; y: number }

export interface KSTRendererOptions {
    /** 目标 pane ID（默认 'sub'） */
    paneId?: string
}

function getKSTStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn('[KSTRenderer] Scheduler not available via service locator')
        return null
    }
    const meta = scheduler.getIndicatorMetadata('kst')
    if (!meta) {
        console.warn("[KSTRenderer] Indicator metadata for 'kst' not found, skip rendering")
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

/**
 * 创建 KST 渲染器插件
 */
export function createKSTRendererPlugin(options: KSTRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getKSTStateKey(pluginHost, paneId)
    }

    // 线条点缓存
    let cachedKey = ''
    let cachedKSTPoints: LinePoint[] = []
    let cachedSignalPoints: LinePoint[] = []

    function clearLineCache() {
        cachedKey = ''
        cachedKSTPoints = []
        cachedSignalPoints = []
    }

    function buildKSTCacheKey(
        range: { start: number; end: number },
        kLineCenters: number[],
        pane: RenderContext['pane'],
        params: KSTRenderState['params'],
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
            params.showKST,
            params.showSignal,
            params.roc1,
            params.roc2,
            params.roc3,
            params.roc4,
            params.signalPeriod,
        ].join('|')
    }

    return {
        name: `kst_${paneId}`,
        version: '2.1.0',
        description: 'KST 确知指标渲染器（WebGL + Canvas2D 回退）',
        debugName: 'KST',
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
            const state = pluginHost?.getSharedState<KSTRenderState>(stateKey)
            if (!state || state.visibleMin > state.visibleMax) {
                clearLineCache()
                return
            }

            const { valueMin, valueMax, params, series } = state
            const valueRange = valueMax - valueMin || 1

            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayMax = displayRange.maxPrice
            const displayValueRange = displayMax - displayMin || 1
            const zeroY = pane.height - (0 - displayMin) / displayValueRange * pane.height

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            // 绘制零轴（实线，保持 Canvas 2D）
            const lineStartX = scrollLeft
            const lineEndX = scrollLeft + context.paneWidth

            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(lineStartX, zeroY)
            ctx.lineTo(lineEndX, zeroY)
            ctx.stroke()

            ctx.restore()

            // 确定绘制范围
            const drawStart = Math.max(range.start, params.roc4 + 15 + params.signalPeriod - 1)
            const drawEnd = Math.min(range.end, series.length)

            // 更新线条缓存
            const cacheKey = buildKSTCacheKey(range, kLineCenters, pane, params, state.timestamp)
            if (cachedKey !== cacheKey) {
                cachedKey = cacheKey
                cachedKSTPoints = []
                cachedSignalPoints = []

                if (params.showKST) {
                    for (let i = drawStart; i < drawEnd; i++) {
                        const point = series[i]
                        if (!point) continue

                        const centerX = kLineCenters[i - range.start]
                        if (centerX === undefined) continue

                        const logicY = pane.height - (point.kst - displayMin) / displayValueRange * pane.height
                        cachedKSTPoints.push({ x: centerX, y: logicY })
                    }
                }

                if (params.showSignal) {
                    for (let i = drawStart; i < drawEnd; i++) {
                        const point = series[i]
                        if (!point) continue

                        const centerX = kLineCenters[i - range.start]
                        if (centerX === undefined) continue

                        const logicY = pane.height - (point.signal - displayMin) / displayValueRange * pane.height
                        cachedSignalPoints.push({ x: centerX, y: logicY })
                    }
                }
            }

            // 绘制 KST 线（WebGL 优先，Canvas2D 回退）
            const enableWebGL = context.settings?.enableWebGLRendering !== false
            let usedWebGL = false
            if (enableWebGL && lineWebGLSurface?.isAvailable()) {
                const lines: Array<{ points: LinePoint[]; width: number; color: string }> = []
                if (params.showKST && cachedKSTPoints.length >= 2) {
                    lines.push({ points: cachedKSTPoints, width: 1, color: colors.kst.kst })
                }
                if (params.showSignal && cachedSignalPoints.length >= 2) {
                    lines.push({ points: cachedSignalPoints, width: 1, color: colors.kst.signal })
                }

                const allOk = lines.length > 0 && lineWebGLSurface.drawLineStrips(lines, scrollLeft)

                if (allOk) {
                    usedWebGL = true
                    lineWebGLSurface.compositeTo(ctx, { imageSmoothingEnabled: false })
                }
            }

            if (!usedWebGL) {
                drawKSTLinesWithCanvas2D(ctx, scrollLeft, cachedKSTPoints, cachedSignalPoints, params, colors)
            }
        },

        getConfig() {
            const stateKey = resolveKey()
            if (!stateKey) return {}
            const state = pluginHost?.getSharedState<KSTRenderState>(stateKey)
            return state?.params ?? {}
        },

        setConfig() {
            // no-op: 配置通过 scheduler.updateKSTConfig() 更新
        },
    }
}

/**
 * 使用 Canvas 2D 绘制 KST 线（WebGL 回退）
 */
function drawKSTLinesWithCanvas2D(
    ctx: CanvasRenderingContext2D,
    scrollLeft: number,
    kstPoints: LinePoint[],
    signalPoints: LinePoint[],
    params: { showKST: boolean; showSignal: boolean },
    colors: { kst: { kst: string; signal: string } }
): void {
    ctx.save()
    ctx.translate(-scrollLeft, 0)
    ctx.lineWidth = 1
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    if (params.showKST && kstPoints.length >= 2) {
        ctx.strokeStyle = colors.kst.kst
        ctx.beginPath()
        ctx.moveTo(kstPoints[0]!.x, kstPoints[0]!.y)
        for (let i = 1; i < kstPoints.length; i++) {
            const point = kstPoints[i]!
            ctx.lineTo(point.x, point.y)
        }
        ctx.stroke()
    }

    if (params.showSignal && signalPoints.length >= 2) {
        ctx.strokeStyle = colors.kst.signal
        ctx.beginPath()
        ctx.moveTo(signalPoints[0]!.x, signalPoints[0]!.y)
        for (let i = 1; i < signalPoints.length; i++) {
            const point = signalPoints[i]!
            ctx.lineTo(point.x, point.y)
        }
        ctx.stroke()
    }

    ctx.restore()
}

/**
 * 获取 KST 标题信息（供 paneTitle 使用）
 */
export function getKSTTitleInfo(
    index: number,
    roc1: number,
    roc2: number,
    roc3: number,
    roc4: number,
    signalPeriod: number,
    pluginHost: PluginHost,
    paneId: string = 'sub_KST',
    theme: 'light' | 'dark' = 'light',
    isAsiaMarket?: boolean
): { name: string; params: number[]; values: Array<{ label: string; value: number; color: string }> } | null {
    const colors = resolveThemeColors(theme, isAsiaMarket)
    const state = pluginHost.getSharedState<KSTRenderState>(createKSTStateKey(paneId))
    if (!state) return null

    const point = state.series[index]
    if (!point) return null

    const values = []
    if (state.params.showKST) values.push({ label: 'KST', value: point.kst, color: colors.kst.kst })
    if (state.params.showSignal) values.push({ label: 'Signal', value: point.signal, color: colors.kst.signal })

    if (values.length === 0) return null

    return {
        name: 'KST',
        params: [roc1, roc2, roc3, roc4, signalPeriod],
        values,
    }
}

@Indicator({
    name: 'kst',
    displayName: 'KST',
    category: 'oscillator',
    stateKey: createKSTStateKey,
    defaultPaneId: 'sub_KST',
    paneIdField: 'kstPaneId',
    scaleRendererFactory: createKstScaleRendererPlugin,
    updateConfig: (scheduler, params, paneId) => {
    (scheduler as IndicatorScheduler).updateKSTConfig(params as Partial<KSTSchedulerConfig>, paneId)
  },
    visibleState: { compose: createPaddedPointVisibleStateComposer('kst', EMPTY_KST_STATE, ['kst', 'signal'] as const) },
    applyResult: (host, state, paneId) => {
        host.setSharedState(createKSTStateKey(paneId), state as any, 'indicator_scheduler')
    },
})
class KSTIndicatorDefinition {
    static rendererFactory = createKSTRendererPlugin
}
