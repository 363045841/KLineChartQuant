import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { KLineData } from '../../../types/price'
import type { SARRenderState } from '../../indicators/sarState'
import { createSARStateKey, EMPTY_SAR_STATE } from '../../indicators/sarState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey, type TitleInfo, type GetTitleInfoFn } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, SARSchedulerConfig } from '../../indicators/scheduler'
import { calcSARData } from '../../indicators/calculators'
import { createValuePointVisibleStateComposer } from '../../indicators/visibleStateComposers'

const SAR_UP_COLOR = '#22c55e'
const SAR_DOWN_COLOR = '#ef4444'
const DOT_RADIUS = 1.5
const TAU = Math.PI * 2

export interface SARRendererOptions {
    paneId?: string
}

function getSARStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn('[SARRenderer] Scheduler not available via service locator')
        return null
    }
    const meta = scheduler.getIndicatorMetadata('sar')
    if (!meta) {
        console.warn('[SARRenderer] Indicator metadata for \'sar\' not found, skip rendering')
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createSARRendererPlugin(options: SARRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'main' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getSARStateKey(pluginHost, paneId)
    }

    return {
        name: `sar_${paneId}`,
        version: '1.0.0',
        description: 'Parabolic SAR 渲染器（绿色 = 多头止损 / 红色 = 空头止损）',
        debugName: 'SAR',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,

        onInstall(host: PluginHost) {
            pluginHost = host
        },

        getDeclaredNamespaces() {
            const key = resolveKey()
            return key ? [key] : []
        },

        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters } = context

            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<SARRenderState>(stateKey)
            if (!state || !state.params.showSAR || state.visibleMin > state.visibleMax) return

            const { series } = state

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            const drawEnd = Math.min(range.end, series.length)
            for (let i = range.start; i < drawEnd; i++) {
                const point = series[i]
                if (point === undefined) continue
                const centerX = kLineCenters[i - range.start]
                if (centerX === undefined) continue
                const y = pane.yAxis.priceToY(point.value)
                ctx.fillStyle = point.trend === 'up' ? SAR_UP_COLOR : SAR_DOWN_COLOR
                ctx.beginPath()
                ctx.arc(centerX, y, DOT_RADIUS, 0, TAU)
                ctx.fill()
            }

            ctx.restore()
        },

        getConfig() {
            const stateKey = resolveKey()
            if (!stateKey) return {}
            const state = pluginHost?.getSharedState<SARRenderState>(stateKey)
            return state?.params ?? {}
        },

        setConfig() {
            // no-op
        },
    }
}

export function getSARTitleInfo(
    _data: KLineData[],
    index: number | null,
    params: Record<string, number | boolean | string>,
    host: PluginHost,
    paneId: string,
): TitleInfo | null {
    if (index === null) return null
    const state = host.getSharedState<SARRenderState>(createSARStateKey(paneId))
    const p = state?.series[index]
    if (!p) return null

    return {
        name: 'SAR',
        params: [(params.step as number) ?? 0.02, (params.maxStep as number) ?? 0.2],
        values: [
            { label: 'SAR', value: p.value, color: p.trend === 'up' ? '#22c55e' : '#ef4444' },
        ],
    }
}

@Indicator({
    name: 'sar',
    displayName: 'SAR',
    getTitleInfo: getSARTitleInfo,
    category: 'main',
    defaultPaneId: 'main',
    allowMainPane: true,
    mainPane: { rendererName: 'sar_main', toActiveConfig: (params, active) => ({ ...params, showSAR: active }) },
    scale: { indicatorKey: 'sar', label: 'SAR', decimals: 4 },
    visibleState: { compose: createValuePointVisibleStateComposer('sar', EMPTY_SAR_STATE, ['value']) },
    runtime: { defaultConfig:{step:0.02,maxStep:0.2,showSAR:true}, computeKey:'calcSARData', compute:(data,c)=>calcSARData(data,c.step,c.maxStep) },
})
class SARDefinition {
    static rendererFactory = createSARRendererPlugin
}
