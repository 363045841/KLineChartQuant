import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { HVRenderState } from '../../indicators/hvState'
import { createHVStateKey } from '../../indicators/hvState'
import { EMPTY_HV_STATE } from '../../indicators/hvState'
import { createNonNegativeSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, HVSchedulerConfig } from '../../indicators/scheduler'

const HV_COLOR = '#7c3aed'

type LinePoint = { x: number; y: number }

function getHVStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn(`[HVRenderer] Scheduler not available via service locator`)
        return null
    }
    const meta = scheduler.getIndicatorMetadata('hv')
    if (!meta) {
        console.warn(`[HVRenderer] Indicator metadata for 'hv' not found, skip rendering`)
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createHVRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
    const { paneId = 'sub_HV' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getHVStateKey(pluginHost, paneId)
    }

    return {
        name: `hv_${paneId}`,
        version: '1.1.0',
        description: 'HV 历史波动率渲染器（WebGL + Canvas2D 回退）',
        debugName: 'HV',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,
        onInstall(host) { pluginHost = host },
        getDeclaredNamespaces() { const key = resolveKey(); return key ? [key] : [] },
        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters, lineWebGLSurface } = context
            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<HVRenderState>(stateKey)
            if (!state || !state.params.showHV || state.visibleMin > state.visibleMax) return

            const { valueMin, valueMax, series } = state
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayMax = displayRange.maxPrice
            const displayValueRange = displayMax - displayMin || 1
            const paneH = pane.height
            const invRange = paneH / displayValueRange
            const rangeStart = range.start

            const drawEnd = Math.min(range.end, series.length)
            const points: LinePoint[] = []
            for (let i = range.start; i < drawEnd; i++) {
                const value = series[i]
                if (value === undefined) continue
                const centerX = kLineCenters[i - rangeStart]
                if (centerX === undefined) continue
                points.push({ x: centerX, y: paneH - (value - displayMin) * invRange })
            }

            if (points.length < 2) return

            const enableWebGL = context.settings?.enableWebGLRendering !== false
            let usedWebGL = false
            if (enableWebGL && lineWebGLSurface?.isAvailable()) {
                const allOk = lineWebGLSurface.drawLineStrips(
                    [{ points, width: 1, color: HV_COLOR }],
                    scrollLeft,
                )
                if (allOk) {
                    usedWebGL = true
                    lineWebGLSurface.compositeTo(ctx, { imageSmoothingEnabled: false })
                }
            }

            if (usedWebGL) return

            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.strokeStyle = HV_COLOR
            ctx.lineWidth = 1
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'
            ctx.beginPath()
            ctx.moveTo(points[0]!.x, points[0]!.y)
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i]!.x, points[i]!.y)
            }
            ctx.stroke()
            ctx.restore()
        },
        getConfig() {
            const stateKey = resolveKey()
            if (!stateKey) return {}
            const state = pluginHost?.getSharedState<HVRenderState>(stateKey)
            return state?.params ?? {}
        },
        setConfig() {},
    }
}

@Indicator({
    name: 'hv',
    displayName: 'HV',
    category: 'oscillator',
    stateKey: createHVStateKey,
    defaultPaneId: 'sub_HV',
    paneIdField: 'hvPaneId',
    scale: { indicatorKey: 'hv', label: 'HV', decimals: 2 },
    updateConfig: (scheduler, params, paneId) => {
    (scheduler as IndicatorScheduler).updateHVConfig(params as Partial<HVSchedulerConfig>, paneId)
  },
    visibleState: { compose: createNonNegativeSparseVisibleStateComposer('hv', EMPTY_HV_STATE) },
    applyResult: (host, state, paneId) => {
        host.setSharedState(createHVStateKey(paneId), state as any, 'indicator_scheduler')
    },
})
class HVIndicatorDefinition {
    static rendererFactory = createHVRendererPlugin
}
