import type { RendererPluginWithHost, PluginHost, RenderContext } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { KLineData } from '../../../types/price'
import { alignToPhysicalPixelCenter } from '../../draw/pixelAlign'
import { resolveThemeColors } from '../../../tokens'
import { ENE_STATE_KEY, type ENERenderState } from '../../indicators/eneState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorPriceRangeComputer, IndicatorRenderStateComposer } from '../../indicators/indicatorMetadata'
import type { ENESchedulerConfig, IndicatorScheduler } from '../../indicators/scheduler'

type LinePoint = { x: number; y: number }

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

function drawENEWithWebGL(
    context: RenderContext,
    data: {
        upperPoints: LinePoint[]
        middlePoints: LinePoint[]
        lowerPoints: LinePoint[]
    }
): boolean {
    const colors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)
    if (context.settings?.enableWebGLRendering === false) return false
    const surface = context.lineWebGLSurface
    if (!surface || !surface.isAvailable()) return false

    surface.clear()

    let allOk = true
    if (data.upperPoints.length >= 2 && data.lowerPoints.length >= 2) {
        surface.clear()
        allOk = surface.drawFilledBand(
            { upperPoints: data.upperPoints, lowerPoints: data.lowerPoints },
            toOpaqueRgba(colors.ene.bandFill),
            context.scrollLeft
        )
        if (allOk) {
            compositeLineSurface(context, surface, getRgbaAlpha(colors.ene.bandFill))
        }
    }
    surface.clear()

    const lineStrips: Array<{ points: LinePoint[]; width: number; color: string }> = []
    if (data.upperPoints.length >= 2) {
        lineStrips.push({ points: data.upperPoints, width: 1, color: colors.ene.upper })
    }
    if (data.middlePoints.length >= 2) {
        lineStrips.push({ points: data.middlePoints, width: 1, color: colors.ene.middle })
    }
    if (data.lowerPoints.length >= 2) {
        lineStrips.push({ points: data.lowerPoints, width: 1, color: colors.ene.lower })
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

/** 创建 ENE（轨道线）渲染器插件（无状态版本）
 *
 * 设计原则：
 * 1. 不持有任何计算缓存或配置状态
 * 2. 所有数据从 StateStore 读取（通过 ENE_STATE_KEY）
 * 3. 配置变更通过外部 IndicatorScheduler 处理
 * 4. 纯绘制函数，无副作用
 */
function getENEStateKey(host: PluginHost | null): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn('[ENERenderer] Scheduler not available via service locator')
        return null
    }
    const meta = scheduler.getIndicatorMetadata('ene')
    if (!meta) {
        console.warn('[ENERenderer] Indicator metadata for \'ene\' not found, skip rendering')
        return null
    }
    return resolveStateKey(meta.stateKey)
}

const computeENEPriceRange: IndicatorPriceRangeComputer = (bundle, range) => {
    const series = bundle.ene.series
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

const composeENERenderState: IndicatorRenderStateComposer = (bundle, range, timestamp): ENERenderState => {
    const priceRange = computeENEPriceRange(bundle, range) ?? { min: Infinity, max: -Infinity }
    return {
        timestamp,
        series: bundle.ene.series,
        params: bundle.ene.params,
        visibleMin: priceRange.min,
        visibleMax: priceRange.max,
    }
}

export function createENERendererPlugin(): RendererPluginWithHost {
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getENEStateKey(pluginHost)
    }

    return {
        name: 'ene',
        version: '2.1.0',
        description: 'ENE 轨道线渲染器（无状态）',
        debugName: 'ENE轨道线',
        paneId: 'main',
        priority: RENDERER_PRIORITY.INDICATOR,

        /**
         * 安装时捕获 PluginHost 引用
         */
        onInstall(host: PluginHost): void {
            pluginHost = host
        },

        /**
         * 声明使用的 StateStore 命名空间
         */
        getDeclaredNamespaces(): string[] {
            const key = resolveKey()
            return key ? [key] : []
        },

        /**
         * 绘制 ENE 线
         * 从 StateStore 读取预计算数据，仅执行绘制
         */
        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, dpr, kLineCenters } = context
            const klineData = data as KLineData[]
            const colors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)

            const stateKey = resolveKey()
            if (!stateKey) return
            // 从 StateStore 读取 ENE 状态
            const state = pluginHost?.getSharedState<ENERenderState>(stateKey)

            // 无有效数据时提前返回
            if (!state || state.visibleMin > state.visibleMax) return
            if (state.series.length === 0) return

            const { period } = state.params
            const eneData = state.series

            if (klineData.length < period) return

            const drawStart = Math.max(range.start, period - 1)
            const drawEnd = Math.min(range.end, klineData.length)
            const upperPoints: LinePoint[] = []
            const middlePoints: LinePoint[] = []
            const lowerPoints: LinePoint[] = []

            for (let i = drawStart; i < drawEnd; i++) {
                const ene = eneData[i]
                if (!ene) continue

                const centerX = kLineCenters[i - range.start]
                if (centerX === undefined) continue

                upperPoints.push({
                    x: centerX,
                    y: alignToPhysicalPixelCenter(pane.yAxis.priceToY(ene.upper), dpr),
                })
                middlePoints.push({
                    x: centerX,
                    y: alignToPhysicalPixelCenter(pane.yAxis.priceToY(ene.middle), dpr),
                })
                lowerPoints.push({
                    x: centerX,
                    y: alignToPhysicalPixelCenter(pane.yAxis.priceToY(ene.lower), dpr),
                })
            }

            if (drawENEWithWebGL(context, { upperPoints, middlePoints, lowerPoints })) {
                return
            }

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            ctx.fillStyle = colors.ene.bandFill
            ctx.beginPath()
            if (upperPoints.length > 0) {
                ctx.moveTo(upperPoints[0]!.x, upperPoints[0]!.y)
                for (let i = 1; i < upperPoints.length; i++) {
                    const point = upperPoints[i]!
                    ctx.lineTo(point.x, point.y)
                }
                for (let i = lowerPoints.length - 1; i >= 0; i--) {
                    const point = lowerPoints[i]!
                    ctx.lineTo(point.x, point.y)
                }
            }
            ctx.closePath()
            ctx.fill()

            ctx.lineWidth = 1
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'

            const drawLine = (points: LinePoint[], color: string) => {
                if (points.length === 0) return
                ctx.strokeStyle = color
                ctx.beginPath()
                ctx.moveTo(points[0]!.x, points[0]!.y)
                for (let i = 1; i < points.length; i++) {
                    const point = points[i]!
                    ctx.lineTo(point.x, point.y)
                }
                ctx.stroke()
            }

            drawLine(upperPoints, colors.ene.upper)
            drawLine(middlePoints, colors.ene.middle)
            drawLine(lowerPoints, colors.ene.lower)

            ctx.restore()
        },

        /**
         * 获取配置（兼容性接口）
         * 从 StateStore 读取实际配置
         */
        getConfig() {
            const stateKey = resolveKey()
            if (!stateKey) return {}
            const state = pluginHost?.getSharedState<ENERenderState>(stateKey)
            return state ? { ...state.params } : {}
        },

        /**
         * 设置配置（兼容性接口，无实际操作）
         *
         * 重要：本渲染器为无状态设计，不持有配置。
         * 配置变更应通过外部控制器调用 IndicatorScheduler.updateENEConfig() 完成。
         */
        setConfig(_newConfig: Record<string, unknown>) {
            // 无状态渲染器不存储配置
            // 外部控制器应调用 chart.getIndicatorScheduler().updateENEConfig()
        },
    }
}

@Indicator({
    name: 'ene',
    displayName: 'ENE',
    category: 'main',
    stateKey: ENE_STATE_KEY,
    defaultPaneId: 'main',
    mainPane: {
        rendererName: 'ene',
        toActiveConfig: (params, active) => active ? params : null,
        computePriceRange: computeENEPriceRange,
        composeRenderState: composeENERenderState,
    },
    updateConfig: (scheduler, params) => {
        (scheduler as IndicatorScheduler).updateENEConfig(params as Partial<ENESchedulerConfig>)
    },
    semantic: {
        apply: (chart, indicator) => {
            const params = (indicator as { params?: { period?: number; deviation?: number } }).params
            chart.updateRendererConfig('ene', {
                period: params?.period || 10,
                deviation: params?.deviation || 11,
            })
        },
    },
    applyResult: (host, state, _paneId) => {
        host.setSharedState(ENE_STATE_KEY, state as any, 'indicator_scheduler')
    },
})
class ENEDefinition {
    static rendererFactory = createENERendererPlugin
}
