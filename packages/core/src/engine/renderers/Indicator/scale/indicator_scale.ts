import type { RendererPluginWithHost, PluginHost, RenderContext, BaseIndicatorState } from '../../../../plugin'
import { RENDERER_PRIORITY } from '../../../../plugin'
import { createIndicatorStateKey } from '../../../../plugin/stateKeys'
import { resolveThemeColors } from '../../../../tokens'
import { getFont, setCanvasFont } from '../../../theme/fonts'
import { calculateValueTickPositions, type ScaleType } from '../../../utils/tickPosition'
import { drawCrosshairPriceLabel } from '../../../../utils/kLineDraw/axis'
import { roundToPhysicalPixel, alignToPhysicalPixelCenter } from '../../../draw/pixelAlign'

interface IndicatorScaleRenderState extends BaseIndicatorState {
    valueMin: number
    valueMax: number
}

// Canvas 状态缓存，避免读取 ctx 属性（读取会触发颜色序列化，很慢）
interface CanvasState {
    font?: string
    fillStyle?: string
    textAlign?: string
    textBaseline?: string
}
const ctxState = new WeakMap<CanvasRenderingContext2D, CanvasState>()

function getCanvasState(ctx: CanvasRenderingContext2D): CanvasState {
    let s = ctxState.get(ctx)
    if (!s) {
        s = {}
        ctxState.set(ctx, s)
    }
    return s
}

export interface IndicatorScaleRendererOptions {
    axisWidth: number
    paneId: string
    indicatorKey: string
    label: string
    decimals?: number
    yPaddingPx?: number
    scaleType?: ScaleType
    getCrosshair?: () => { y: number; price: number; activePaneId: string | null } | null
    formatTickLabel?: (value: number) => string
    formatCrosshairLabel?: (value: number) => string
}

export interface DrawScaleTicksOptions {
    ctx: CanvasRenderingContext2D
    dpr: number
    axisWidth: number
    height: number
    paddingTop: number
    paddingBottom: number
    valueMin: number
    valueMax: number
    isMain: boolean
    decimals?: number
    hideEdgeTicks?: boolean
    scaleType?: ScaleType
    formatLabel?: (value: number) => string
    /** 文字对齐方式，默认 'center'。左侧轴应使用 'right' */
    textAlign?: CanvasTextAlign
}

const BASELINE_MIDDLE = 'middle' as const
const ALIGN_CENTER = 'center' as const

export function drawScaleTicks(options: DrawScaleTicksOptions & { tickColor: string }): void {
    const {
        ctx,
        dpr,
        axisWidth,
        height,
        paddingTop,
        paddingBottom,
        valueMin,
        valueMax,
        isMain,
        decimals = 2,
        hideEdgeTicks = true,
        scaleType = 'linear',
        formatLabel,
        textAlign = 'center',
    } = options

    ctx.clearRect(0, 0, axisWidth, height)

    const font = getFont(12)
    setCanvasFont(ctx, font)
    ctx.textBaseline = BASELINE_MIDDLE
    ctx.textAlign = textAlign as CanvasTextAlign
    ctx.fillStyle = options.tickColor

    const alignTo = textAlign === 'center'
      ? roundToPhysicalPixel(axisWidth / 2, dpr)
      : textAlign === 'right'
        ? roundToPhysicalPixel(axisWidth - 4, dpr)
        : roundToPhysicalPixel(4, dpr)
    const textX = alignTo

    const positions = calculateValueTickPositions({
        height,
        paddingTop,
        paddingBottom,
        isMain,
        hideEdgeTicks,
        valueMin,
        valueMax,
        scaleType,
    })

    // 提前提取 format 函数，避免循环内重复判断
    const format = formatLabel ?? ((v: number) => v.toFixed(decimals))

    for (let i = 0; i < positions.length; i++) {
        const { y, value } = positions[i]!
        ctx.fillText(format(value), textX, y)
    }
}

export function createIndicatorScaleRendererPlugin(options: IndicatorScaleRendererOptions): RendererPluginWithHost {
    const {
        axisWidth,
        paneId,
        indicatorKey,
        label,
        decimals = 2,
        yPaddingPx = 0,
        scaleType = 'linear',
        getCrosshair,
        formatTickLabel,
        formatCrosshairLabel,
    } = options
    const stateKey = createIndicatorStateKey(indicatorKey, paneId)
    let pluginHost: PluginHost | null = null

    return {
        name: `${indicatorKey}Scale_${paneId}`,
        version: '1.0.0',
        description: `${label} 刻度渲染器`,
        debugName: `${label}刻度`,
        paneId,
        priority: RENDERER_PRIORITY.INDICATOR_SCALE,
        layer: 'overlay',

        onInstall(host: PluginHost) {
            pluginHost = host
        },

        draw(context: RenderContext) {
            const { yAxisCtx, pane, dpr } = context
            if (!yAxisCtx || !pluginHost) return

            const state = pluginHost.getSharedState<IndicatorScaleRenderState>(stateKey)
            if (!state) return

            const effectiveScaleType: ScaleType = pane.yAxis.getScaleType() ?? scaleType
            const effectiveAxisWidth = yAxisCtx.canvas ? (yAxisCtx.canvas.width / dpr) : axisWidth
            const tokenColors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)

            const displayRange = pane.yAxis.getDisplayRange({
                minPrice: state.valueMin,
                maxPrice: state.valueMax,
            })

            drawScaleTicks({
                tickColor: tokenColors.text.secondary,
                ctx: yAxisCtx,
                dpr,
                axisWidth: effectiveAxisWidth,
                height: pane.height,
                paddingTop: pane.yAxis.getPaddingTop(),
                paddingBottom: pane.yAxis.getPaddingBottom(),
                valueMin: displayRange.minPrice,
                valueMax: displayRange.maxPrice,
                isMain: false,
                decimals,
                hideEdgeTicks: false,
                scaleType: effectiveScaleType,
                formatLabel: formatTickLabel,
            })

            const crosshair = getCrosshair?.()
            if (!crosshair || crosshair.activePaneId !== pane.id) return

            const localY = crosshair.y - pane.top
            const paddingTop = pane.yAxis.getPaddingTop()
            const paddingBottom = pane.yAxis.getPaddingBottom()
            const yStart = paddingTop
            const yEnd = Math.max(paddingTop, pane.height - paddingBottom)
            const viewH = Math.max(1, yEnd - yStart)
            const clampedY = Math.min(Math.max(localY, yStart), yEnd)
            const t = (clampedY - yStart) / viewH
            const displayPrice = displayRange.maxPrice - t * (displayRange.maxPrice - displayRange.minPrice)

            drawCrosshairPriceLabel(yAxisCtx, {
                x: 0,
                y: 0,
                width: effectiveAxisWidth,
                height: pane.height,
                crosshairY: localY,
                priceRange: displayRange,
                yPaddingPx,
                dpr,
                fontSize: 12,
                priceOffset: 0,
                price: displayPrice,
                formatPrice: formatCrosshairLabel,
            }, context.theme, context.isAsiaMarket, context.colorPresetSettings)
        },
    }
}
