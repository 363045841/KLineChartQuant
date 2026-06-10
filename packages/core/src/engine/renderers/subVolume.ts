import type { RendererPluginWithHost, RenderContext, PluginHost, BaseIndicatorState } from '../../plugin'
import { RENDERER_PRIORITY } from '../../plugin'
import { createIndicatorStateKey } from '../../plugin/stateKeys'
import type { KLineData } from '../../types/price'
import { resolveThemeColors } from '../../tokens'
import { Indicator } from '../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../indicators/scheduler'
import { createVolumeScaleRendererPlugin } from './Indicator/scale/volume_scale'

export interface VolumeRendererOptions {
    /** 目标 pane ID（默认 'sub'） */
    paneId?: string
}

export interface VolumeRenderState extends BaseIndicatorState {
    valueMin: number
    valueMax: number
}

function getVolumeStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn('[VolumeRenderer] Scheduler not available via service locator')
        return null
    }
    const meta = scheduler.getIndicatorMetadata('volume')
    if (!meta) {
        console.warn("[VolumeRenderer] Indicator metadata for 'volume' not found, skip rendering")
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

/**
 * 创建副图成交量渲染器插件
 */
export function createVolumeRendererPlugin(options: VolumeRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub' } = options
    let pluginHost: PluginHost | null = null

    function resolveKey(): string | null {
        return getVolumeStateKey(pluginHost, paneId)
    }

    return {
        name: `volume_${paneId}`,
        version: '1.0.0',
        description: '成交量渲染器',
        debugName: '成交量',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,

        onInstall(host: PluginHost) {
            pluginHost = host
        },

        getDeclaredNamespaces() {
            const key = resolveKey()
            return key ? [key] : []
        },

        draw(context: RenderContext) {
            const { ctx, pane, data, range, dpr } = context
            const colors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)
            const upVolume = colors.volumeUp
            const downVolume = colors.volumeDown
            const neutralVolume = colors.candleDojiBorder
            const klineData = data as KLineData[]
            if (!klineData.length) return

            const { start, end } = range

            let maxVolume = 0
            let minVolume = Infinity
            for (let i = start; i < end && i < klineData.length; i++) {
                const item = klineData[i]
                if (!item) continue
                const volume = item.volume
                if (volume !== undefined && volume !== null) {
                    maxVolume = Math.max(maxVolume, volume)
                    minVolume = Math.min(minVolume, volume)
                }
            }

            if (maxVolume === 0 || !Number.isFinite(minVolume)) {
                return
            }

            const padding = Math.max(0.05, (maxVolume - minVolume) * 0.1)
            const valueMin = Math.max(0, minVolume - padding)
            const valueMax = maxVolume + padding
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayMax = displayRange.maxPrice
            const displayValueRange = displayMax - displayMin || 1
            const baseY = pane.height - (0 - displayMin) / displayValueRange * pane.height
            const alignedBaseY = Math.round(baseY * dpr) / dpr

            const stateKey = resolveKey()
            if (!stateKey) return
            pluginHost?.setSharedState<VolumeRenderState>(stateKey, {
                valueMin,
                valueMax,
                timestamp: Date.now(),
            }, `volume_${paneId}`)

            const maxRects = Math.max(1, end - start)
            const upBuf = new Float32Array(maxRects * 4)
            const downBuf = new Float32Array(maxRects * 4)
            const neutralBuf = new Float32Array(maxRects * 4)
            let upCount = 0
            let downCount = 0
            let neutralCount = 0

            for (let i = start; i < end; i++) {
                const item = klineData[i]
                if (!item) continue
                const volume = item.volume
                if (!volume) continue
                const barRect = context.kBarRects[i - start]
                if (!barRect) continue

                const y = pane.height - (volume - displayMin) / displayValueRange * pane.height
                const alignedY = Math.round(y * dpr) / dpr
                const minBarHPx = 1 / dpr
                const rawH = alignedBaseY - alignedY
                const finalH = rawH <= 0 ? minBarHPx : Math.max(rawH, minBarHPx)
                const finalY = rawH <= 0 ? alignedBaseY - minBarHPx : alignedBaseY - finalH

                const color = judgeColor(item, upVolume, downVolume, neutralVolume)

                let buf: Float32Array
                let idx: number
                if (color === upVolume) {
                    buf = upBuf; idx = upCount++
                } else if (color === downVolume) {
                    buf = downBuf; idx = downCount++
                } else {
                    buf = neutralBuf; idx = neutralCount++
                }
                const off = idx * 4
                buf[off] = barRect.x
                buf[off + 1] = finalY
                buf[off + 2] = barRect.width
                buf[off + 3] = finalH
            }

            const usedWebGL = drawVolumeWithWebGL(context, upBuf, upCount, downBuf, downCount, neutralBuf, neutralCount, upVolume, downVolume, neutralVolume)
            if (!usedWebGL) {
                drawVolumeWithCanvas2D(ctx, context.scrollLeft, upBuf, upCount, downBuf, downCount, neutralBuf, neutralCount, upVolume, downVolume, neutralVolume)
            } else {
                compositeVolumeWebGL(ctx, context)
            }
        },
    }
}

function drawVolumeWithWebGL(
    context: RenderContext,
    upBuf: Float32Array, upCount: number,
    downBuf: Float32Array, downCount: number,
    neutralBuf: Float32Array, neutralCount: number,
    upColor: string, downColor: string, neutralColor: string
): boolean {
    if (context.settings?.enableWebGLRendering === false) return false
    const surface = context.candleWebGLSurface
    if (!surface || !surface.isAvailable()) return false

    surface.clear()

    const ok1 = upCount === 0 || surface.drawRectBuffer(upBuf.subarray(0, upCount * 4), upCount, upColor, context.scrollLeft)
    const ok2 = downCount === 0 || surface.drawRectBuffer(downBuf.subarray(0, downCount * 4), downCount, downColor, context.scrollLeft)
    const ok3 = neutralCount === 0 || surface.drawRectBuffer(neutralBuf.subarray(0, neutralCount * 4), neutralCount, neutralColor, context.scrollLeft)

    return ok1 && ok2 && ok3
}

function drawVolumeWithCanvas2D(
    ctx: CanvasRenderingContext2D,
    scrollLeft: number,
    upBuf: Float32Array, upCount: number,
    downBuf: Float32Array, downCount: number,
    neutralBuf: Float32Array, neutralCount: number,
    upColor: string, downColor: string, neutralColor: string
): void {
    ctx.save()
    ctx.translate(-scrollLeft, 0)

    ctx.fillStyle = upColor
    for (let i = 0; i < upCount; i++) {
        const off = i * 4
        ctx.fillRect(upBuf[off], upBuf[off + 1], upBuf[off + 2], upBuf[off + 3])
    }

    ctx.fillStyle = downColor
    for (let i = 0; i < downCount; i++) {
        const off = i * 4
        ctx.fillRect(downBuf[off], downBuf[off + 1], downBuf[off + 2], downBuf[off + 3])
    }

    ctx.fillStyle = neutralColor
    for (let i = 0; i < neutralCount; i++) {
        const off = i * 4
        ctx.fillRect(neutralBuf[off], neutralBuf[off + 1], neutralBuf[off + 2], neutralBuf[off + 3])
    }

    ctx.restore()
}

function compositeVolumeWebGL(ctx: CanvasRenderingContext2D, context: RenderContext): void {
    const surface = context.candleWebGLSurface
    if (!surface) return

    surface.compositeTo(ctx)
}

/**
 * 判断成交量柱子颜色
 */
function judgeColor(dayData: KLineData, upColor: string, downColor: string, neutralColor: string): string {
    if (dayData.close > dayData.open) {
        return upColor
    } else if (dayData.close < dayData.open) {
        return downColor
    } else {
        return neutralColor
    }
}

@Indicator({
    name: 'volume',
    displayName: 'VOL',
    category: 'volume',
    defaultPaneId: 'sub',
    scaleRendererFactory: createVolumeScaleRendererPlugin,
})
class VolumeIndicatorDefinition {
    static rendererFactory = createVolumeRendererPlugin
}
