import { resolveThemeColors } from '../../../tokens'
import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { StructureRenderState } from '../../indicators/structureState'
import { createStructureStateKey } from '../../indicators/structureState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../../indicators/scheduler'

const LABEL_FONT = '11px sans-serif'

function getStructureStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn(`[StructureRenderer] Scheduler not available via service locator`)
        return null
    }
    const meta = scheduler.getIndicatorMetadata('structure')
    if (!meta) {
        console.warn(`[StructureRenderer] Indicator metadata for 'structure' not found, skip rendering`)
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createStructureRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
    const { paneId = 'sub_Structure' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getStructureStateKey(pluginHost, paneId)
    }
    return {
        name: `structure_${paneId}`,
        version: '1.0.0',
        description: 'SMC 结构渲染器（swing 标签 + BOS/CHOCH 触发线）',
        debugName: 'Structure',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,
        onInstall(host) { pluginHost = host },
        getDeclaredNamespaces() { const key = resolveKey(); return key ? [key] : [] },
        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters } = context
            const colors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)
            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<StructureRenderState>(stateKey)
            if (!state) return
            const params = state.params
            const { swings, events } = state.series
            if (!params.showSwingLabels && !params.showBOS && !params.showCHOCH) return

            const toY = (v: number) => pane.yAxis.priceToY(v)

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
                    ctx.fillStyle = s.label === 'HH' ? colors.structure.hh : s.label === 'HL' ? colors.structure.hl : s.label === 'LH' ? colors.structure.lh : colors.structure.ll
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
                    ctx.strokeStyle = ev.kind === 'BOS' ? colors.structure.bos : colors.structure.choch
                    ctx.beginPath()
                    ctx.moveTo(x1, y)
                    ctx.lineTo(x2, y)
                    ctx.stroke()
                    ctx.fillStyle = ev.kind === 'BOS' ? colors.structure.bos : colors.structure.choch
                    ctx.fillText(ev.kind, (x1 + x2) / 2, y - 4)
                }
                ctx.setLineDash([])
            }

            ctx.restore()
        },
        getConfig() {
            const stateKey = resolveKey()
            if (!stateKey) return {}
            const state = pluginHost?.getSharedState<StructureRenderState>(stateKey)
            return state?.params ?? {}
        },
        setConfig() {},
    }
}

@Indicator({
    name: 'structure',
    displayName: 'Structure',
    category: 'sub',
    stateKey: createStructureStateKey,
    defaultPaneId: 'sub_Structure',
    paneIdField: 'structurePaneId',
    allowMainPane: true,
    applyResult: (host, state, paneId) => {
        host.setSharedState(createStructureStateKey(paneId), state as any, 'indicator_scheduler')
    },
})
class StructureIndicatorDefinition {
    static rendererFactory = createStructureRendererPlugin
}
