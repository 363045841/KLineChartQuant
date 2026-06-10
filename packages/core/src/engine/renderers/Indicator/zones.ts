import { resolveThemeColors } from '../../../tokens'
import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { ZonesRenderState } from '../../indicators/zonesState'
import { createZonesStateKey, EMPTY_ZONES_STATE } from '../../indicators/zonesState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { createFixedUnitVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { resolveStateKey, type TitleInfo, type TitleValueItem, type GetTitleInfoFn } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, ZonesSchedulerConfig } from '../../indicators/scheduler'
import { calcZonesData } from '../../indicators/calculators'

function getZonesStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn('[ZonesRenderer] Scheduler not available via service locator')
        return null
    }
    const meta = scheduler.getIndicatorMetadata('zones')
    if (!meta) {
        console.warn('[ZonesRenderer] Indicator metadata for \'zones\' not found, skip rendering')
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createZonesRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
    const { paneId = 'main' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getZonesStateKey(pluginHost, paneId)
    }
    return {
        name: `zones_${paneId}`,
        version: '1.0.0',
        description: 'SMC 区域渲染器（FVG 缺口 + Order Blocks 订单块）',
        debugName: 'Zones',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,
        onInstall(host) { pluginHost = host },
        getDeclaredNamespaces() { const key = resolveKey(); return key ? [key] : [] },
        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters } = context
            const colors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)
            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<ZonesRenderState>(stateKey)
            if (!state) return
            const { showFVG, showOB, showFilledZones } = state.params
            if (!showFVG && !showOB) return

            const toY = (v: number) => pane.yAxis.priceToY(v)

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            for (const zone of state.series) {
                const isFVG = zone.kind === 'FVG_BULL' || zone.kind === 'FVG_BEAR'
                const isOB = zone.kind === 'OB_BULL' || zone.kind === 'OB_BEAR'
                if (isFVG && !showFVG) continue
                if (isOB && !showOB) continue
                if (zone.endIndex !== undefined && !showFilledZones) continue

                const startIdx = zone.startIndex
                const endIdx = zone.endIndex ?? range.end - 1
                if (endIdx < range.start || startIdx >= range.end) continue

                const startX = kLineCenters[Math.max(startIdx, range.start) - range.start]
                const endX = kLineCenters[Math.min(endIdx, range.end - 1) - range.start]
                if (startX === undefined || endX === undefined) continue

                const yHigh = toY(zone.high)
                const yLow = toY(zone.low)
                const fill = zone.kind === 'FVG_BULL' ? colors.zones.fvgBullFill
                    : zone.kind === 'FVG_BEAR' ? colors.zones.fvgBearFill
                    : zone.kind === 'OB_BULL' ? colors.zones.obBullFill
                    : colors.zones.obBearFill
                ctx.fillStyle = fill
                ctx.fillRect(startX, yHigh, endX - startX, yLow - yHigh)
            }

            ctx.restore()
        },
        getConfig() {
            const stateKey = resolveKey()
            if (!stateKey) return {}
            return pluginHost?.getSharedState<ZonesRenderState>(stateKey)?.params ?? {}
        },
        setConfig() {},
    }
}

export const getZonesTitleInfo: GetTitleInfoFn = (_data, index, _params, host, paneId) => {
    if (index === null) return null

    const stateKey = createZonesStateKey(paneId)
    const state = host?.getSharedState<ZonesRenderState>(stateKey)
    if (!state) return null

    const activeZones = state.series.filter(
        z => z.startIndex <= index && (z.endIndex === undefined || z.endIndex >= index)
    )
    if (activeZones.length === 0) return null

    const values: TitleValueItem[] = activeZones.slice(0, 5).map(z => ({
        label: z.kind,
        value: z.high,
        color: z.kind.includes('Bull') ? '#22c55e' : '#ef4444',
    }))

    return {
        name: 'Zones',
        params: [activeZones.length],
        values,
    }
}

@Indicator({
    name: 'zones',
    displayName: 'Zones',
    getTitleInfo: getZonesTitleInfo,
    category: 'main',
    defaultPaneId: 'main',
    allowMainPane: true,
    mainPane: { rendererName: 'zones_main', toActiveConfig: (params, active) => ({ ...params, showFVG: active, showOB: active, showFilledZones: active }) },
    scale: { indicatorKey: 'zones', label: 'Zones', decimals: 2 },
    visibleState: { compose: createFixedUnitVisibleStateComposer('zones', EMPTY_ZONES_STATE) },
    runtime: { defaultConfig:{showFVG:true,showOB:true,showFilledZones:true,obLookback:20}, computeKey:'calcZonesData', compute:(data,c)=>calcZonesData(data,c.obLookback,5,2,'close') },
})
class ZonesDefinition {
    static rendererFactory = createZonesRendererPlugin
}
