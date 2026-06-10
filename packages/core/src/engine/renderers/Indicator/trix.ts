import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import { resolveThemeColors } from '../../../tokens'
import type { TRIXRenderState } from '../../indicators/trixState'
import { createTRIXStateKey } from '../../indicators/trixState'
import { EMPTY_TRIX_STATE } from '../../indicators/trixState'
import { createDualSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler, TRIXSchedulerConfig } from '../../indicators/scheduler'
import { calcTRIXData } from '../../indicators/calculators'
import type { KLineData } from '../../../types/price'
import type { TitleInfo } from '../../indicators/indicatorMetadata'

const TRIX_COLOR = '#e11d48'
const SIGNAL_COLOR = '#f59e0b'

type Point = { x: number; y: number }

export interface TRIXRendererOptions { paneId?: string }

function getTRIXStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn(`[TRIXRenderer] Scheduler not available via service locator`)
        return null
    }
    const meta = scheduler.getIndicatorMetadata('trix')
    if (!meta) {
        console.warn(`[TRIXRenderer] Indicator metadata for 'trix' not found, skip rendering`)
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

export function createTRIXRendererPlugin(options: TRIXRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub_TRIX' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getTRIXStateKey(pluginHost, paneId)
    }

    return {
        name: `trix_${paneId}`,
        version: '1.1.0',
        description: 'TRIX 三重指数平滑振荡器渲染器（WebGL + Canvas2D 回退）',
        debugName: 'TRIX',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,

        onInstall(host: PluginHost) { pluginHost = host },
        getDeclaredNamespaces() { const key = resolveKey(); return key ? [key] : [] },

        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, kLineCenters, lineWebGLSurface } = context
            const stateKey = resolveKey()
            if (!stateKey) return
            const state = pluginHost?.getSharedState<TRIXRenderState>(stateKey)
            if (!state || state.visibleMin > state.visibleMax) return
            const { showTRIX, showSignal } = state.params
            if (!showTRIX && !showSignal) return

            const { valueMin, valueMax, series, signalSeries } = state
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayMax = displayRange.maxPrice
            const displayValueRange = displayMax - displayMin || 1
            const paneH = pane.height
            const invRange = paneH / displayValueRange
            const rangeStart = range.start
            const toY = (v: number) => paneH - (v - displayMin) * invRange

            // Zero line
            const zeroY = toY(0)
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

            const trixPts: Point[] = []
            const sigPts: Point[] = []
            const drawEnd = Math.min(range.end, series.length)
            for (let i = range.start; i < drawEnd; i++) {
                const centerX = kLineCenters[i - rangeStart]
                if (centerX === undefined) continue
                if (showTRIX) {
                    const v = series[i]
                    if (v !== undefined) trixPts.push({ x: centerX, y: toY(v) })
                }
                if (showSignal) {
                    const s = signalSeries[i]
                    if (s !== undefined) sigPts.push({ x: centerX, y: toY(s) })
                }
            }

            if (trixPts.length < 2 && sigPts.length < 2) return

            const lines: Array<{ points: Point[]; width: number; color: string }> = []
            if (trixPts.length >= 2) lines.push({ points: trixPts, width: 1, color: TRIX_COLOR })
            if (sigPts.length >= 2) lines.push({ points: sigPts, width: 1, color: SIGNAL_COLOR })

            const enableWebGL = context.settings?.enableWebGLRendering !== false
            let usedWebGL = false
            if (enableWebGL && lineWebGLSurface?.isAvailable()) {
                const allOk = lines.length > 0 && lineWebGLSurface.drawLineStrips(lines, scrollLeft)
                if (allOk) {
                    usedWebGL = true
                    lineWebGLSurface.compositeTo(ctx, { imageSmoothingEnabled: false })
                }
            }

            if (usedWebGL) return

            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.lineWidth = 1
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'
            drawLine(ctx, trixPts, TRIX_COLOR)
            drawLine(ctx, sigPts, SIGNAL_COLOR)
            ctx.restore()
        },

        getConfig() {
            const stateKey = resolveKey()
            if (!stateKey) return {}
            const state = pluginHost?.getSharedState<TRIXRenderState>(stateKey)
            return state?.params ?? {}
        },
        setConfig() {},
    }
}

function drawLine(ctx: CanvasRenderingContext2D, pts: Point[], color: string): void {
    if (pts.length < 2) return
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.moveTo(pts[0]!.x, pts[0]!.y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y)
    ctx.stroke()
}

export function getTRIXTitleInfo(
  _data: KLineData[],
  index: number | null,
  params: Record<string, number | boolean | string>,
  pluginHost: PluginHost,
  paneId: string,
): TitleInfo | null {
  if (index === null) return null
  const period = (params.period as number) ?? 15
  const signalPeriod = (params.signalPeriod as number) ?? 9
  const state = pluginHost.getSharedState<TRIXRenderState>(createTRIXStateKey(paneId))
  if (!state) return null

  const values: Array<{ label: string; value: number; color: string }> = []

  if (state.params.showTRIX) {
    const v = state.series[index]
    if (v !== undefined) values.push({ label: 'TRIX', value: v, color: TRIX_COLOR })
  }
  if (state.params.showSignal) {
    const v = state.signalSeries[index]
    if (v !== undefined) values.push({ label: 'Signal', value: v, color: SIGNAL_COLOR })
  }

  if (values.length === 0) return null

  return {
    name: 'TRIX',
    params: [period, signalPeriod],
    values,
  }
}

@Indicator({
    name: 'trix',
    displayName: 'TRIX',
    category: 'oscillator',
    defaultPaneId: 'sub_TRIX',
    scale: { indicatorKey: 'trix', label: 'TRIX', decimals: 6 },
    visibleState: { compose: createDualSparseVisibleStateComposer('trix', EMPTY_TRIX_STATE) },
    getTitleInfo: getTRIXTitleInfo,
    runtime: { defaultConfig:{period:15,signalPeriod:9,showTRIX:true,showSignal:true}, computeKey:'calcTRIXData', compute:(data,c)=>calcTRIXData(data,c.period,c.signalPeriod) },
})
class TRIXIndicatorDefinition {
    static rendererFactory = createTRIXRendererPlugin
}
