import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { VolumeProfileRenderState } from '../../indicators/volumeProfileState'
import { createVolumeProfileStateKey, EMPTY_VOLUME_PROFILE_STATE } from '../../indicators/volumeProfileState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { createVolumeProfileVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, VolumeProfileSchedulerConfig } from '../../indicators/scheduler'

const BAR_FILL = 'rgba(99, 102, 241, 0.35)'
const POC_COLOR = '#f59e0b'
const VA_COLOR = 'rgba(99, 102, 241, 0.6)'

const PROFILE_WIDTH_PX = 80

function getVolumeProfileStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn(`[VolumeProfileRenderer] Scheduler not available via service locator`)
        return null
    }
    const meta = scheduler.getIndicatorMetadata('volumeProfile')
    if (!meta) {
        console.warn(`[VolumeProfileRenderer] Indicator metadata for 'volumeProfile' not found, skip rendering`)
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createVolumeProfileRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
    const { paneId = 'sub_VolumeProfile' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getVolumeProfileStateKey(pluginHost, paneId)
    }
    return {
        name: `volumeProfile_${paneId}`,
        version: '1.0.0',
        description: 'Volume Profile 渲染器（POC + Value Area + 价格-成交量直方图）',
        debugName: 'VolumeProfile',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,
        onInstall(host) { pluginHost = host },
        getDeclaredNamespaces() { const key = resolveKey(); return key ? [key] : [] },
        draw(context: RenderContext) {
            const { ctx, pane, scrollLeft } = context
            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<VolumeProfileRenderState>(stateKey)
            if (!state) return
            const { bins, poc, vah, val, totalVolume } = state.series
            if (bins.length === 0 || totalVolume <= 0) return
            const { showPOC, showValueArea } = state.params

            const displayRange = pane.yAxis.getDisplayRange()
            const displayMin = displayRange.minPrice
            const displayValueRange = (displayRange.maxPrice - displayMin) || 1
            const toY = (v: number) => pane.height - (v - displayMin) / displayValueRange * pane.height

            const maxBinVolume = Math.max(...bins.map((b) => b.volume))
            if (maxBinVolume <= 0) return

            ctx.save()
            ctx.translate(-scrollLeft, 0)
            const profileX = scrollLeft + context.paneWidth - PROFILE_WIDTH_PX

            ctx.fillStyle = BAR_FILL
            for (const bin of bins) {
                const yTop = toY(bin.priceHigh)
                const yBot = toY(bin.priceLow)
                const barWidth = (bin.volume / maxBinVolume) * PROFILE_WIDTH_PX
                ctx.fillRect(profileX, yTop, barWidth, yBot - yTop)
            }

            if (showValueArea) {
                ctx.strokeStyle = VA_COLOR
                ctx.lineWidth = 1
                ctx.setLineDash([4, 4])
                const vahY = toY(vah)
                const valY = toY(val)
                ctx.beginPath()
                ctx.moveTo(scrollLeft, vahY)
                ctx.lineTo(scrollLeft + context.paneWidth, vahY)
                ctx.moveTo(scrollLeft, valY)
                ctx.lineTo(scrollLeft + context.paneWidth, valY)
                ctx.stroke()
                ctx.setLineDash([])
            }

            if (showPOC) {
                ctx.strokeStyle = POC_COLOR
                ctx.lineWidth = 1
                const pocY = toY(poc)
                ctx.beginPath()
                ctx.moveTo(scrollLeft, pocY)
                ctx.lineTo(scrollLeft + context.paneWidth, pocY)
                ctx.stroke()
            }

            ctx.restore()
        },
        getConfig() {
            const stateKey = resolveKey()
            if (!stateKey) return {}
            const state = pluginHost?.getSharedState<VolumeProfileRenderState>(stateKey)
            return state?.params ?? {}
        },
        setConfig() {},
    }
}

@Indicator({
    name: 'volumeProfile',
    displayName: 'VP',
    category: 'volume',
    stateKey: createVolumeProfileStateKey,
    defaultPaneId: 'sub_VolumeProfile',
    paneIdField: 'volumeProfilePaneId',
    scale: { indicatorKey: 'volumeProfile', label: 'VP', decimals: 0 },
    visibleState: { compose: createVolumeProfileVisibleStateComposer('volumeProfile', EMPTY_VOLUME_PROFILE_STATE) },
    updateConfig: (scheduler, params, paneId) => {
        (scheduler as IndicatorScheduler).updateVolumeProfileConfig(params as Partial<VolumeProfileSchedulerConfig>, paneId)
    },
    applyResult: (host, state, paneId) => {
        host.setSharedState(createVolumeProfileStateKey(paneId), state as any, 'indicator_scheduler')
    },
})
class VolumeProfileIndicatorDefinition {
    static rendererFactory = createVolumeProfileRendererPlugin
}
