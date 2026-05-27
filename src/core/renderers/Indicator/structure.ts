import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { StructureRenderState } from '@/core/indicators/structureState'
import { createStructureStateKey } from '@/core/indicators/structureState'

const HH_COLOR = '#16a34a'
const HL_COLOR = '#22c55e'
const LH_COLOR = '#f87171'
const LL_COLOR = '#dc2626'
const BOS_COLOR = '#2563eb'
const CHOCH_COLOR = '#a855f7'
const LABEL_FONT = '11px sans-serif'

export function createStructureRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
    const { paneId = 'sub_Structure' } = options
    const STATE_KEY = createStructureStateKey(paneId)
    let pluginHost: PluginHost | null = null
    return {
        name: `structure_${paneId}`,
        version: '1.0.0',
        description: 'SMC 结构渲染器（swing 标签 + BOS/CHOCH 触发线）',
        debugName: 'Structure',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,
        onInstall(host) { pluginHost = host },
        getDeclaredNamespaces() { return [STATE_KEY] },
        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters } = context
            const state = pluginHost?.getSharedState<StructureRenderState>(STATE_KEY)
            if (!state) return
            const params = state.params
            const { swings, events } = state.series
            if (!params.showSwingLabels && !params.showBOS && !params.showCHOCH) return

            const displayRange = pane.yAxis.getDisplayRange()
            const displayMin = displayRange.minPrice
            const displayValueRange = (displayRange.maxPrice - displayMin) || 1
            const toY = (v: number) => pane.height - (v - displayMin) / displayValueRange * pane.height

            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.font = LABEL_FONT
            ctx.textAlign = 'center'

            if (params.showSwingLabels) {
                for (const s of swings) {
                    if (s.index < range.start || s.index >= range.end) continue
                    if (!s.confirmed && !params.showProvisional) continue
                    const centerX = kLineCenters[s.index - range.start]
                    if (centerX === undefined) continue
                    const y = toY(s.price)
                    ctx.fillStyle = s.label === 'HH' ? HH_COLOR : s.label === 'HL' ? HL_COLOR : s.label === 'LH' ? LH_COLOR : LL_COLOR
                    const labelY = s.kind === 'high' ? y - 8 : y + 16
                    ctx.fillText(s.label, centerX, labelY)
                    // Dot
                    ctx.beginPath()
                    ctx.arc(centerX, y, 2, 0, Math.PI * 2)
                    ctx.fill()
                }
            }

            if (params.showBOS || params.showCHOCH) {
                ctx.lineWidth = 1
                ctx.setLineDash([4, 4])
                for (const ev of events) {
                    if (ev.kind === 'BOS' && !params.showBOS) continue
                    if (ev.kind === 'CHOCH' && !params.showCHOCH) continue
                    if (ev.index < range.start || ev.index >= range.end) continue
                    if (ev.brokenSwingIndex < range.start) continue
                    const x1 = kLineCenters[ev.brokenSwingIndex - range.start]
                    const x2 = kLineCenters[ev.index - range.start]
                    if (x1 === undefined || x2 === undefined) continue
                    const y = toY(ev.brokenLevel)
                    ctx.strokeStyle = ev.kind === 'BOS' ? BOS_COLOR : CHOCH_COLOR
                    ctx.beginPath()
                    ctx.moveTo(x1, y)
                    ctx.lineTo(x2, y)
                    ctx.stroke()
                    ctx.fillStyle = ev.kind === 'BOS' ? BOS_COLOR : CHOCH_COLOR
                    ctx.fillText(ev.kind, (x1 + x2) / 2, y - 4)
                }
                ctx.setLineDash([])
            }

            ctx.restore()
        },
        getConfig() { return pluginHost?.getSharedState<StructureRenderState>(STATE_KEY)?.params ?? {} },
        setConfig() {},
    }
}
