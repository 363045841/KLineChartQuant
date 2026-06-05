import type { RendererPluginWithHost, PluginHost, RenderContext } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { KLineData } from '../../../types/price'
import { alignToPhysicalPixelCenter } from '../../draw/pixelAlign'
import { resolveThemeColors } from '../../../tokens'
import { EXPMA_STATE_KEY, type EXPMARenderState } from '../../indicators/expmaState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../../indicators/scheduler'

type LinePoint = { x: number; y: number }

function buildEXPMACacheKey(
    range: { start: number; end: number },
    kLineCenters: number[],
    pane: RenderContext['pane'],
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
    ].join('|')
}

function getEXPMAStateKey(host: PluginHost | null): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn('[EXPMARenderer] Scheduler not available via service locator')
        return null
    }
    const meta = scheduler.getIndicatorMetadata('expma')
    if (!meta) {
        console.warn('[EXPMARenderer] Indicator metadata for \'expma\' not found, skip rendering')
        return null
    }
    return resolveStateKey(meta.stateKey)
}

export function createEXPMARendererPlugin(): RendererPluginWithHost {
    let pluginHost: PluginHost | null = null
    let cachedKey = ''
    let cachedFastPoints: LinePoint[] = []
    let cachedSlowPoints: LinePoint[] = []

    function clearCache() {
        cachedKey = ''
        cachedFastPoints = []
        cachedSlowPoints = []
    }

    function resolveKey(): string | null {
        return getEXPMAStateKey(pluginHost)
    }

    return {
        name: 'expma',
        version: '2.1.0',
        description: 'EXPMA 指数平滑移动平均线渲染器（带绘制缓存）',
        debugName: 'EXPMA',
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
            const { ctx, pane, data, range, scrollLeft, dpr, kLineCenters, lineWebGLSurface } = context
            const klineData = data as KLineData[]
            const colors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)
            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<EXPMARenderState>(stateKey)

            if (!state || state.visibleMin > state.visibleMax) {
                clearCache()
                return
            }
            if (state.series.length === 0 || klineData.length < 2) {
                clearCache()
                return
            }

            const expmaData = state.series
            const drawStart = range.start
            const drawEnd = Math.min(range.end, klineData.length)
            const cacheKey = buildEXPMACacheKey(range, kLineCenters, pane, state.timestamp)

            if (cachedKey !== cacheKey) {
                cachedKey = cacheKey
                cachedFastPoints = []
                cachedSlowPoints = []

                for (let i = drawStart; i < drawEnd; i++) {
                    const expma = expmaData[i]
                    if (!expma) continue

                    const centerX = kLineCenters[i - range.start]
                    if (centerX === undefined) continue

                    cachedFastPoints.push({ x: centerX, y: pane.yAxis.priceToY(expma.fast) })
                    cachedSlowPoints.push({ x: centerX, y: pane.yAxis.priceToY(expma.slow) })
                }
            }

            const enableWebGL = context.settings?.enableWebGLRendering !== false
            let usedWebGL = false
            if (enableWebGL && lineWebGLSurface?.isAvailable()) {
                const lines: Array<{ points: LinePoint[]; width: number; color: string }> = []
                if (cachedFastPoints.length >= 2) {
                    lines.push({ points: cachedFastPoints, width: 1, color: colors.expma.fast })
                }
                if (cachedSlowPoints.length >= 2) {
                    lines.push({ points: cachedSlowPoints, width: 1, color: colors.expma.slow })
                }

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

            if (cachedFastPoints.length >= 2) {
                ctx.strokeStyle = colors.expma.fast
                ctx.beginPath()
                ctx.moveTo(cachedFastPoints[0]!.x, cachedFastPoints[0]!.y)
                for (let i = 1; i < cachedFastPoints.length; i++) {
                    const point = cachedFastPoints[i]!
                    ctx.lineTo(point.x, point.y)
                }
                ctx.stroke()
            }

            if (cachedSlowPoints.length >= 2) {
                ctx.strokeStyle = colors.expma.slow
                ctx.beginPath()
                ctx.moveTo(cachedSlowPoints[0]!.x, cachedSlowPoints[0]!.y)
                for (let i = 1; i < cachedSlowPoints.length; i++) {
                    const point = cachedSlowPoints[i]!
                    ctx.lineTo(point.x, point.y)
                }
                ctx.stroke()
            }

            ctx.restore()
        },

        getConfig() {
            const stateKey = resolveKey()
            if (!stateKey) return {}
            const state = pluginHost?.getSharedState<EXPMARenderState>(stateKey)
            return state ? { ...state.params } : {}
        },

        setConfig(_newConfig: Record<string, unknown>) {
        },
    }
}

@Indicator({
    name: 'expma',
    displayName: 'EXPMA',
    category: 'main',
    stateKey: EXPMA_STATE_KEY,
    defaultPaneId: 'main',
    applyResult: (host, state, _paneId) => {
        host.setSharedState(EXPMA_STATE_KEY, state as any, 'indicator_scheduler')
    },
})
class EXPMADefinition {
    static rendererFactory = createEXPMARendererPlugin
}
