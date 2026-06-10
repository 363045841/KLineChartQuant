import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { KLineData } from '../../../types/price'
import type { SuperTrendRenderState } from '../../indicators/supertrendState'
import { createSuperTrendStateKey, EMPTY_SUPERTREND_STATE } from '../../indicators/supertrendState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey, type TitleInfo, type GetTitleInfoFn } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, SuperTrendSchedulerConfig } from '../../indicators/scheduler'
import { calcSuperTrendData } from '../../indicators/calculators'
import { createValuePointVisibleStateComposer } from '../../indicators/visibleStateComposers'

const ST_UP_COLOR = '#22c55e'
const ST_DOWN_COLOR = '#ef4444'

export interface SuperTrendRendererOptions {
    paneId?: string
}

function getSuperTrendStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn(`[SuperTrendRenderer] Scheduler not available via service locator`)
        return null
    }
    const meta = scheduler.getIndicatorMetadata('supertrend')
    if (!meta) {
        console.warn(`[SuperTrendRenderer] Indicator metadata for 'supertrend' not found, skip rendering`)
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createSuperTrendRendererPlugin(options: SuperTrendRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub_SuperTrend' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getSuperTrendStateKey(pluginHost, paneId)
    }

    return {
        name: `supertrend_${paneId}`,
        version: '1.0.0',
        description: 'SuperTrend ATR 趋势带渲染器（趋势翻转处颜色切换）',
        debugName: 'SuperTrend',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,

        onInstall(host: PluginHost) { pluginHost = host },
        getDeclaredNamespaces() { const key = resolveKey(); return key ? [key] : [] },

        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters } = context
            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<SuperTrendRenderState>(stateKey)
            if (!state || !state.params.showSuperTrend || state.visibleMin > state.visibleMax) return

            const { series } = state

            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.lineWidth = 1
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'

            const drawEnd = Math.min(range.end, series.length)
            let prevX: number | null = null
            let prevY: number | null = null
            let prevTrend: 'up' | 'down' | null = null

            for (let i = range.start; i < drawEnd; i++) {
                const point = series[i]
                if (point === undefined) continue
                const centerX = kLineCenters[i - range.start]
                if (centerX === undefined) continue
                const y = pane.yAxis.priceToY(point.value)

                if (prevX !== null && prevTrend === point.trend) {
                    ctx.strokeStyle = point.trend === 'up' ? ST_UP_COLOR : ST_DOWN_COLOR
                    ctx.beginPath()
                    ctx.moveTo(prevX, prevY!)
                    ctx.lineTo(centerX, y)
                    ctx.stroke()
                }

                prevX = centerX
                prevY = y
                prevTrend = point.trend
            }
            ctx.restore()
        },

        getConfig() {
            const stateKey = resolveKey()
            if (!stateKey) return {}
            const state = pluginHost?.getSharedState<SuperTrendRenderState>(stateKey)
            return state?.params ?? {}
        },
        setConfig() {},
    }
}

export function getSuperTrendTitleInfo(
    _data: KLineData[],
    index: number | null,
    params: Record<string, number | boolean | string>,
    host: PluginHost,
    paneId: string,
): TitleInfo | null {
    if (index === null) return null
    const state = host.getSharedState<SuperTrendRenderState>(createSuperTrendStateKey(paneId))
    const p = state?.series[index]
    if (!p) return null

    return {
        name: 'SuperTrend',
        params: [(params.atrPeriod as number) ?? 10, (params.multiplier as number) ?? 3],
        values: [
            { label: p.trend === 'up' ? 'Up' : 'Down', value: p.value, color: p.trend === 'up' ? '#22c55e' : '#ef4444' },
        ],
    }
}

@Indicator({
    name: 'supertrend',
    displayName: 'SuperTrend',
    getTitleInfo: getSuperTrendTitleInfo,
    category: 'oscillator',
    defaultPaneId: 'sub_SuperTrend',
    allowMainPane: true,
    mainPane: { rendererName: 'supertrend_main', toActiveConfig: (params, active) => ({ ...params, showSuperTrend: active }) },
    scale: { indicatorKey: 'supertrend', label: 'SuperTrend', decimals: 2 },
    visibleState: { compose: createValuePointVisibleStateComposer('supertrend', EMPTY_SUPERTREND_STATE, ['value']) },
    runtime: { defaultConfig:{atrPeriod:10,multiplier:3,showSuperTrend:true}, computeKey:'calcSuperTrendData', compute:(data,c)=>calcSuperTrendData(data,c.atrPeriod,c.multiplier) },
})
class SuperTrendIndicatorDefinition {
    static rendererFactory = createSuperTrendRendererPlugin
}
