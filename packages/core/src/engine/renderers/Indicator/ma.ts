import type { RendererPluginWithHost, PluginHost, RenderContext } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import { MA_STATE_KEY, type MARenderState } from '../../indicators/maState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorPriceRangeComputer, IndicatorRenderStateComposer, GetTitleInfoFn, TitleInfo, TitleValueItem } from '../../indicators/indicatorMetadata'
import type { KLineData } from '../../../types/price'
import type { IndicatorScheduler } from '../../indicators/scheduler'
import { calcMAData, type MAFlags } from '../../indicators/calculators'
import { alignToPhysicalPixelCenter } from '../../draw/pixelAlign'
import { resolveThemeColors } from '../../../tokens'

// Re-export MAFlags from calculators for backward compatibility
export type { MAFlags } from '../../indicators/calculators'

type LinePoint = { x: number; y: number }

const SEMANTIC_MA_PERIOD_FLAGS = new Map<number, keyof MAFlags>([
    [5, 'ma5'],
    [10, 'ma10'],
    [20, 'ma20'],
    [30, 'ma30'],
    [60, 'ma60'],
])

const computeMAPriceRange: IndicatorPriceRangeComputer = (bundle, range) => {
    const seriesList = Object.values(bundle.ma.series)
    if (seriesList.length === 0 || range.start >= seriesList[0]!.length) {
        return null
    }

    let min = Infinity
    let max = -Infinity
    for (const values of seriesList) {
        const end = Math.min(range.end, values.length)
        for (let i = range.start; i < end; i++) {
            const v = values[i]
            if (v !== undefined) {
                min = Math.min(min, v)
                max = Math.max(max, v)
            }
        }
    }

    return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null
}

const composeMARenderState: IndicatorRenderStateComposer = (bundle, range, timestamp): MARenderState => {
    const priceRange = computeMAPriceRange(bundle, range) ?? { min: Infinity, max: -Infinity }
    return {
        timestamp,
        series: bundle.ma.series,
        enabledPeriods: bundle.ma.enabledPeriods,
        visibleMin: priceRange.min,
        visibleMax: priceRange.max,
    }
}

function buildMACacheKey(
    range: { start: number; end: number },
    kLineCenters: number[],
    pane: RenderContext['pane'],
    enabledPeriods: number[],
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
        enabledPeriods.join(','),
        pane.height.toFixed(2),
    ].join('|')
}

function getMAStateKey(host: PluginHost | null): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn('[MARenderer] Scheduler not available via service locator')
        return null
    }
    const meta = scheduler.getIndicatorMetadata('ma')
    if (!meta) {
        console.warn('[MARenderer] Indicator metadata for \'ma\' not found, skip rendering')
        return null
    }
    return resolveStateKey(meta.stateKey)
}

export function getMATitleInfo(
    _data: KLineData[],
    index: number | null,
    _params: Record<string, number | boolean | string>,
    pluginHost: PluginHost,
    _paneId: string,
): TitleInfo | null {
    if (index === null) return null

    const stateKey = getMAStateKey(pluginHost)
    if (!stateKey) return null

    const state = pluginHost?.getSharedState<MARenderState>(stateKey)
    if (!state || state.visibleMin > state.visibleMax) return null

    const maColors: Record<number, string> = {
        5: '#f5a623',
        10: '#4ecdc4',
        20: '#45b7d1',
        30: '#96ceb4',
        60: '#dda0dd',
    }

    const values: TitleValueItem[] = []
    for (const period of state.enabledPeriods) {
        const series = state.series[period]
        const value = series?.[index]
        if (value === undefined) continue

        values.push({
            label: `MA${period}`,
            value,
            color: maColors[period] ?? '#f5a623',
        })
    }

    return { name: 'MA', params: [], values }
}

@Indicator({
    name: 'ma',
    displayName: 'MA',
    category: 'main',
    defaultPaneId: 'main',
    mainPane: {
        rendererName: 'ma',
        toActiveConfig: (_params, active) => ({
            ma5: active,
            ma10: active,
            ma20: active,
            ma30: active,
            ma60: active,
        }),
        computePriceRange: computeMAPriceRange,
        composeRenderState: composeMARenderState,
    },
    semantic: {
        apply: (chart, indicator) => {
            const periods = (indicator as { params?: { periods?: number[] } }).params?.periods ?? [5, 10, 20, 30, 60]
            const maFlags: Partial<MAFlags> = {}
            for (const period of periods) {
                const flag = SEMANTIC_MA_PERIOD_FLAGS.get(period)
                if (flag) maFlags[flag] = true
            }
            chart.updateRendererConfig('ma', maFlags)
        },
    },
    runtime: { defaultConfig:{ma5:true,ma10:true,ma20:true,ma30:true,ma60:true}, computeKey:'calcMAData', compute:(data,c)=>{const p=[5,10,20,30,60];const r:Record<number,(number|undefined)[]>={};for(const o of p){if((c as any)['ma'+o])r[o]=calcMAData(data,o)}return r} },
    getTitleInfo: getMATitleInfo,
})
class MADefinition {
    static rendererFactory = createMARendererPlugin
}

export function createMARendererPlugin(): RendererPluginWithHost {
    let pluginHost: PluginHost | null = null
    let cachedKey = ''
    let cachedLines = new Map<number, LinePoint[]>()

    function clearCache() {
        cachedKey = ''
        cachedLines = new Map()
    }

    function resolveKey(): string | null {
        return getMAStateKey(pluginHost)
    }

    return {
        name: 'ma',
        version: '2.1.0',
        description: 'MA均线渲染器',
        debugName: 'MA均线',
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
            const { ctx, pane, range, scrollLeft, dpr, kLineCenters, lineWebGLSurface } = context
            const colors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)
            const maColors: Record<number, string> = { 5: colors.ma.ma5, 10: colors.ma.ma10, 20: colors.ma.ma20, 30: colors.ma.ma30, 60: colors.ma.ma60 }
            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<MARenderState>(stateKey)

            if (!state || state.visibleMin > state.visibleMax) {
                clearCache()
                return
            }

            if (state.enabledPeriods.length === 0) {
                clearCache()
                return
            }

            const cacheKey = buildMACacheKey(range, kLineCenters, pane, state.enabledPeriods, state.timestamp)
            if (cachedKey !== cacheKey) {
                cachedKey = cacheKey
                cachedLines = new Map()

                for (const [periodStr, values] of Object.entries(state.series)) {
                    const period = Number(periodStr)
                    const points: LinePoint[] = []

                    for (let i = range.start; i < range.end && i < values.length; i++) {
                        const maValue = values[i]
                        if (maValue === undefined) continue

                        const centerX = kLineCenters[i - range.start]
                        if (centerX === undefined) continue

                        points.push({ x: centerX, y: pane.yAxis.priceToY(maValue) })
                    }

                    if (points.length >= 2) {
                        cachedLines.set(period, points)
                    }
                }
            }

            // 检查 WebGL 渲染开关（默认开启）及 GPU 加速是否可用
            const enableWebGL = context.settings?.enableWebGLRendering !== false
            let usedWebGL = false
            if (enableWebGL && lineWebGLSurface?.isAvailable()) {
                // 组装所有周期的折线数据，批量提交 GPU 一次性渲染，避免逐条 beginPath 的 CPU 开销
                const lines: Array<{ points: LinePoint[]; width: number; color: string }> = []
                for (const period of state.enabledPeriods) {
                    const points = cachedLines.get(period)
                    if (!points) continue
                    lines.push({ points, width: 1, color: maColors[period] ?? colors.ma.ma5 })
                }
                const allOk = lines.length > 0 && lineWebGLSurface.drawLineStrips(lines, scrollLeft)

                if (allOk) {
                    usedWebGL = true
                    // 将 WebGL 离屏帧缓冲区内容通过 drawImage 合成到主 Canvas2D
                    lineWebGLSurface.compositeTo(ctx, { imageSmoothingEnabled: false })
                }
            }

            // WebGL 渲染失败或未开启时的 Canvas2D 降级路径
            if (usedWebGL) return

            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.lineWidth = 1
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'

            for (const period of state.enabledPeriods) {
                const points = cachedLines.get(period)
                if (!points || points.length < 2) continue
                ctx.strokeStyle = maColors[period] ?? colors.ma.ma5
                ctx.beginPath()
                ctx.moveTo(points[0]!.x, points[0]!.y)
                for (let i = 1; i < points.length; i++) {
                    const point = points[i]!
                    ctx.lineTo(point.x, point.y)
                }
                ctx.stroke()
            }

            ctx.restore()
        },

        getConfig() {
            const stateKey = resolveKey()
            if (!stateKey) return {}
            const state = pluginHost?.getSharedState<MARenderState>(stateKey)
            const config: Record<string, boolean> = {}
            state?.enabledPeriods.forEach(period => {
                config[`ma${period}`] = true
            })
            return config
        },

        setConfig(_newConfig: Record<string, unknown>) {
        },
    }
}
