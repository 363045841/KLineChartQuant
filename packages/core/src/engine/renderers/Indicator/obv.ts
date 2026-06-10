import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { OBVRenderState } from '../../indicators/obvState'
import { createOBVStateKey, EMPTY_OBV_STATE } from '../../indicators/obvState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import type { IndicatorScheduler, OBVSchedulerConfig } from '../../indicators/scheduler'
import { calcOBVData } from '../../indicators/calculators'
import type { TitleInfo } from '../../indicators/indicatorMetadata'
import type { KLineData } from '../../../types/price'

const OBV_COLOR = '#16a34a'

type LinePoint = { x: number; y: number }

function getOBVStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn(`[OBVRenderer] Scheduler not available via service locator`)
        return null
    }
    const meta = scheduler.getIndicatorMetadata('obv')
    if (!meta) {
        console.warn(`[OBVRenderer] Indicator metadata for 'obv' not found, skip rendering`)
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createOBVRendererPlugin(options: { paneId?: string } = {}): RendererPluginWithHost {
    const { paneId = 'sub_OBV' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getOBVStateKey(pluginHost, paneId)
    }
    return {
        name: `obv_${paneId}`,
        version: '1.1.0',
        description: 'OBV 能量潮渲染器（WebGL + Canvas2D 回退）',
        debugName: 'OBV',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,
        onInstall(host) { pluginHost = host },
        getDeclaredNamespaces() { const key = resolveKey(); return key ? [key] : [] },
        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters, lineWebGLSurface } = context
            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<OBVRenderState>(stateKey)
            if (!state || !state.params.showOBV || state.visibleMin > state.visibleMax) return

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
                    [{ points, width: 1, color: OBV_COLOR }],
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
            ctx.strokeStyle = OBV_COLOR
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
            const state = pluginHost?.getSharedState<OBVRenderState>(stateKey)
            return state?.params ?? {}
        },
        setConfig() {},
    }
}

export function getOBVTitleInfo(
  _data: KLineData[],
  index: number | null,
  _params: Record<string, number | boolean | string>,
  host: PluginHost,
  paneId: string,
): TitleInfo | null {
  if (index === null) return null
  const state = host.getSharedState<OBVRenderState>(createOBVStateKey(paneId))
  const value = state?.series[index]
  if (value === undefined) return null

  return {
    name: 'OBV',
    params: [],
    values: [{ label: 'OBV', value, color: OBV_COLOR }],
  }
}

@Indicator({
    name: 'obv',
    displayName: 'OBV',
    category: 'volume',
    defaultPaneId: 'sub_OBV',
    visibleState: { compose: createSparseVisibleStateComposer('obv', EMPTY_OBV_STATE) },
    scale: { indicatorKey: 'obv', label: 'OBV', decimals: 0 },
    getTitleInfo: getOBVTitleInfo,
    runtime: {
        defaultConfig: { showOBV: true },
        computeKey: 'calcOBVData',
        compute: (data, c) => calcOBVData(data),
    },
})
class OBVIndicatorDefinition {
    static rendererFactory = createOBVRendererPlugin
}
