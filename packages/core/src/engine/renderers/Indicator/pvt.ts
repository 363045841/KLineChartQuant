import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { PVTRenderState } from '../../indicators/pvtState'
import { createPVTStateKey, EMPTY_PVT_STATE } from '../../indicators/pvtState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import type { IndicatorScheduler, PVTSchedulerConfig } from '../../indicators/scheduler'
import { calcPVTData } from '../../indicators/calculators'
import type { TitleInfo } from '../../indicators/indicatorMetadata'
import type { KLineData } from '../../../types/price'

const PVT_COLOR = '#a855f7'

type LinePoint = { x: number; y: number }

function getPVTStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn(`[PVTRenderer] Scheduler not available via service locator`)
        return null
    }
    const meta = scheduler.getIndicatorMetadata('pvt')
    if (!meta) {
        console.warn(`[PVTRenderer] Indicator metadata for 'pvt' not found, skip rendering`)
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createPVTRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
    const { paneId = 'sub_PVT' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getPVTStateKey(pluginHost, paneId)
    }
    return {
        name: `pvt_${paneId}`,
        version: '1.1.0',
        description: 'PVT 量价趋势渲染器（WebGL + Canvas2D 回退）',
        debugName: 'PVT',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,
        onInstall(host) { pluginHost = host },
        getDeclaredNamespaces() { const key = resolveKey(); return key ? [key] : [] },
        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters, lineWebGLSurface } = context
            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<PVTRenderState>(stateKey)
            if (!state || !state.params.showPVT || state.visibleMin > state.visibleMax) return

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
                    [{ points, width: 1, color: PVT_COLOR }],
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
            ctx.strokeStyle = PVT_COLOR
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
            const state = pluginHost?.getSharedState<PVTRenderState>(stateKey)
            return state?.params ?? {}
        },
        setConfig() {},
    }
}

export function getPVTTitleInfo(
  _data: KLineData[],
  index: number | null,
  _params: Record<string, number | boolean | string>,
  host: PluginHost,
  paneId: string,
): TitleInfo | null {
  if (index === null) return null
  const state = host.getSharedState<PVTRenderState>(createPVTStateKey(paneId))
  const value = state?.series[index]
  if (value === undefined) return null

  return {
    name: 'PVT',
    params: [],
    values: [{ label: 'PVT', value, color: PVT_COLOR }],
  }
}

@Indicator({
    name: 'pvt',
    displayName: 'PVT',
    category: 'volume',
    defaultPaneId: 'sub_PVT',
    visibleState: { compose: createSparseVisibleStateComposer('pvt', EMPTY_PVT_STATE) },
    scale: { indicatorKey: 'pvt', label: 'PVT', decimals: 0 },
    getTitleInfo: getPVTTitleInfo,
    runtime: {
        defaultConfig: { showPVT: true },
        computeKey: 'calcPVTData',
        compute: (data, c) => calcPVTData(data),
    },
})
class PVTIndicatorDefinition {
    static rendererFactory = createPVTRendererPlugin
}
