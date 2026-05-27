import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { ZonesRenderState } from '@/core/indicators/zonesState'
import { createZonesStateKey } from '@/core/indicators/zonesState'

const FVG_BULL_FILL = 'rgba(34, 197, 94, 0.12)'
const FVG_BEAR_FILL = 'rgba(239, 68, 68, 0.12)'
const OB_BULL_FILL = 'rgba(34, 197, 94, 0.25)'
const OB_BEAR_FILL = 'rgba(239, 68, 68, 0.25)'

export function createZonesRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
    const { paneId = 'sub_Zones' } = options
    const STATE_KEY = createZonesStateKey(paneId)
    let pluginHost: PluginHost | null = null
    return {
        name: `zones_${paneId}`,
        version: '1.0.0',
        description: 'SMC 区域渲染器（FVG 缺口 + Order Blocks 订单块）',
        debugName: 'Zones',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,
        onInstall(host) { pluginHost = host },
        getDeclaredNamespaces() { return [STATE_KEY] },
        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters } = context
            const state = pluginHost?.getSharedState<ZonesRenderState>(STATE_KEY)
            if (!state) return
            const { showFVG, showOB, showFilledZones } = state.params
            if (!showFVG && !showOB) return

            const displayRange = pane.yAxis.getDisplayRange()
            const displayMin = displayRange.minPrice
            const displayValueRange = (displayRange.maxPrice - displayMin) || 1
            const toY = (v: number) => pane.height - (v - displayMin) / displayValueRange * pane.height

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
                const fill = zone.kind === 'FVG_BULL' ? FVG_BULL_FILL
                    : zone.kind === 'FVG_BEAR' ? FVG_BEAR_FILL
                    : zone.kind === 'OB_BULL' ? OB_BULL_FILL
                    : OB_BEAR_FILL
                ctx.fillStyle = fill
                ctx.fillRect(startX, yHigh, endX - startX, yLow - yHigh)
            }

            ctx.restore()
        },
        getConfig() { return pluginHost?.getSharedState<ZonesRenderState>(STATE_KEY)?.params ?? {} },
        setConfig() {},
    }
}
