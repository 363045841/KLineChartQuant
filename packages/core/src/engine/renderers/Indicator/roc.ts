import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import { resolveThemeColors } from '../../../tokens'
import type { ROCRenderState } from '../../indicators/rocState'
import { createROCStateKey, EMPTY_ROC_STATE } from '../../indicators/rocState'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import type { IndicatorScheduler, ROCSchedulerConfig } from '../../indicators/scheduler'
import { calcROCData } from '../../indicators/calculators'
import type { KLineData } from '../../../types/price'
import type { TitleInfo } from '../../indicators/indicatorMetadata'

const ROC_COLOR = '#0ea5e9'

type LinePoint = { x: number; y: number }

export interface ROCRendererOptions { paneId?: string }

function getROCStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn(`[ROCRenderer] Scheduler not available via service locator`)
        return null
    }
    const meta = scheduler.getIndicatorMetadata('roc')
    if (!meta) {
        console.warn(`[ROCRenderer] Indicator metadata for 'roc' not found, skip rendering`)
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createROCRendererPlugin(options: ROCRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub_ROC' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getROCStateKey(pluginHost, paneId)
    }

    return {
        name: `roc_${paneId}`,
        version: '1.1.0',
        description: 'ROC 变化率渲染器（WebGL + Canvas2D 回退）',
        debugName: 'ROC',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,

        onInstall(host: PluginHost) { pluginHost = host },
        getDeclaredNamespaces() { const key = resolveKey(); return key ? [key] : [] },

        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters, lineWebGLSurface } = context
            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<ROCRenderState>(stateKey)
            if (!state || !state.params.showROC || state.visibleMin > state.visibleMax) return

            const { valueMin, valueMax, series } = state
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayMax = displayRange.maxPrice
            const displayValueRange = displayMax - displayMin || 1
            const paneH = pane.height
            const invRange = paneH / displayValueRange
            const rangeStart = range.start

            // Zero line
            const zeroY = paneH - (0 - displayMin) * invRange
            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
            ctx.lineWidth = 1
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            ctx.moveTo(scrollLeft, zeroY)
            ctx.lineTo(scrollLeft + context.paneWidth, zeroY)
            ctx.stroke()
            ctx.setLineDash([])
            ctx.restore()

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
                    [{ points, width: 1, color: ROC_COLOR }],
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
            ctx.strokeStyle = ROC_COLOR
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
            const state = pluginHost?.getSharedState<ROCRenderState>(stateKey)
            return state?.params ?? {}
        },
        setConfig() {},
    }
}

export function getROCTitleInfo(
  _data: KLineData[],
  index: number | null,
  params: Record<string, number | boolean | string>,
  pluginHost: PluginHost,
  paneId: string,
): TitleInfo | null {
  if (index === null) return null
  const period = (params.period as number) ?? 12
  const state = pluginHost.getSharedState<ROCRenderState>(createROCStateKey(paneId))
  const value = state?.series[index]
  if (value === undefined) return null

  return {
    name: 'ROC',
    params: [period],
    values: [{ label: 'ROC', value, color: ROC_COLOR }],
  }
}

@Indicator({
    name: 'roc',
    displayName: 'ROC',
    category: 'oscillator',
    defaultPaneId: 'sub_ROC',
    visibleState: { compose: createSparseVisibleStateComposer('roc', EMPTY_ROC_STATE) },
    scale: { indicatorKey: 'roc', label: 'ROC', decimals: 2 },
    getTitleInfo: getROCTitleInfo,
    runtime: {
        defaultConfig: { period: 12, showROC: true },
        computeKey: 'calcROCData',
        compute: (data, c) => calcROCData(data, c.period),
    },
})
class ROCIndicatorDefinition {
    static rendererFactory = createROCRendererPlugin
}
