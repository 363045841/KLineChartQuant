import type { RendererPlugin, RenderContext } from '../../plugin'
import { RENDERER_PRIORITY, GLOBAL_PANE_ID } from '../../plugin'
import type { KLineData } from '../../types/price'
import { roundToPhysicalPixel, alignToPhysicalPixelCenter, createHorizontalLineRect } from '../draw/pixelAlign'
import { resolveThemeColors } from '../../tokens'
import { getFont, setCanvasFont } from '../theme/fonts'

const textWidthCache = new Map<string, number>()
const TEXT_WIDTH_CACHE_LIMIT = 256

// 模块级常量，避免每次重复创建
const PADDING = 4
const LINE_LENGTH = 30
const DOT_RADIUS = 2
const MARKER_FONT = getFont(12)
const TAU = Math.PI * 2

// Marker 数据接口，用于批量绘制
interface MarkerData {
    x: number
    y: number
    price: number
    text: string
    textWidth: number
    drawLeft: boolean
    lineStartX: number
    lineEndX: number
    endX: number
    alignedY: number
    textX: number
}

function measureTextWidth(ctx: CanvasRenderingContext2D, text: string): number {
    // 使用固定字体，缓存更稳定
    const key = MARKER_FONT + '|' + text
    const cached = textWidthCache.get(key)
    if (cached !== undefined) {
        return cached
    }

    const savedFont = ctx.font
    ctx.font = MARKER_FONT
    const width = ctx.measureText(text).width
    ctx.font = savedFont

    if (textWidthCache.size >= TEXT_WIDTH_CACHE_LIMIT) {
        textWidthCache.clear()
    }
    textWidthCache.set(key, width)
    return width
}

/**
 * 批量绘制所有 marker
 * 分三个阶段：线条 → 圆点 → 文字，避免 Canvas 状态频繁切换
 */
function drawAllMarkers(
    ctx: CanvasRenderingContext2D,
    markers: MarkerData[],
    dpr: number,
    lineColor: string,
    textColor: string
) {
    if (markers.length === 0) return

    ctx.save()

    // ========== 阶段1：批量绘制所有线条（同一 fillStyle）==========
    ctx.fillStyle = lineColor
    for (const m of markers) {
        const lineRect = createHorizontalLineRect(m.lineStartX, m.lineEndX, m.y, dpr)
        if (lineRect) {
            ctx.fillRect(lineRect.x, lineRect.y, lineRect.width, lineRect.height)
        }
    }

    // ========== 阶段2：批量绘制所有圆点（复用 fillStyle）==========
    ctx.beginPath()
    for (const m of markers) {
        ctx.moveTo(m.endX + DOT_RADIUS, m.alignedY)
        ctx.arc(m.endX, m.alignedY, DOT_RADIUS, 0, TAU)
    }
    ctx.fill()

    // ========== 阶段3：批量绘制所有文字（同一 font/baseline/fillStyle）==========
    setCanvasFont(ctx, MARKER_FONT)
    ctx.textBaseline = 'middle'
    ctx.fillStyle = textColor

    for (const m of markers) {
        ctx.textAlign = m.drawLeft ? 'right' : 'left'
        ctx.fillText(m.text, m.textX, m.alignedY)
    }

    ctx.restore()
}

/**
 * 创建可视区最高/最低价标注渲染器插件
 */
export function createExtremaMarkersRendererPlugin(): RendererPlugin {
    return {
        name: 'extremaMarkers',
        version: '1.0.0',
        description: '可视区最高/最低价标注渲染器',
        debugName: '极值标记',
        paneId: GLOBAL_PANE_ID,
        priority: RENDERER_PRIORITY.OVERLAY,

        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, dpr, paneWidth, kLineCenters } = context
            const colors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)
            const klineData = data as KLineData[]
            if (!klineData.length) return
            if (pane.role !== 'price') return

            const start = Math.max(0, range.start)
            const end = Math.min(klineData.length, range.end)
            if (end - start <= 0) return

            let max = -Infinity
            let min = Infinity
            let maxIndex = start
            let minIndex = start

            for (let i = start; i < end; i++) {
                const e = klineData[i]
                if (!e) continue
                if (e.high >= max) {
                    max = e.high
                    maxIndex = i
                }
                if (e.low <= min) {
                    min = e.low
                    minIndex = i
                }
            }

            if (!Number.isFinite(max) || !Number.isFinite(min)) return

            const getCenterX = (i: number) => {
                const localIdx = i - range.start
                if (localIdx < 0 || localIdx >= kLineCenters.length) return 0
                return kLineCenters[localIdx]!
            }

            if (!context.yAxisLabels) context.yAxisLabels = []

            context.yAxisLabels.push({
                dataIndex: maxIndex,
                price: max,
                y: pane.yAxis.priceToY(max),
                style: {
                    bgColor: colors.lastPriceLabel.bg,
                    borderColor: colors.price.lastPrice,
                    textColor: colors.price.lastPrice,
                }
            })

            context.yAxisLabels.push({
                dataIndex: minIndex,
                price: min,
                y: pane.yAxis.priceToY(min),
                style: {
                    bgColor: colors.lastPriceLabel.bg,
                    borderColor: colors.price.lastPrice,
                    textColor: colors.price.lastPrice,
                }
            })

            // 收集所有 marker 数据
            const markers: MarkerData[] = []

            const maxMarker = createMarkerData(
                getCenterX(maxIndex),
                pane.yAxis.priceToY(max),
                max,
                dpr,
                paneWidth,
                ctx
            )
            if (maxMarker) markers.push(maxMarker)

            const minMarker = createMarkerData(
                getCenterX(minIndex),
                pane.yAxis.priceToY(min),
                min,
                dpr,
                paneWidth,
                ctx
            )
            if (minMarker) markers.push(minMarker)

            // 批量绘制所有 markers
            ctx.save()
            ctx.translate(-scrollLeft, 0)
            drawAllMarkers(ctx, markers, dpr, colors.text.weak, colors.text.primary)
            ctx.restore()
        },
    }
}

/**
 * 创建 marker 数据（不绘制，只计算）
 */
function createMarkerData(
    x: number,
    y: number,
    price: number,
    dpr: number,
    paneWidth: number,
    ctx: CanvasRenderingContext2D
): MarkerData | null {
    const text = price.toFixed(2)
    const textWidth = measureTextWidth(ctx, text)

    const visibleX = x
    const rightEdge = visibleX + LINE_LENGTH + PADDING + textWidth
    const drawLeft = rightEdge > paneWidth

    let lineStartX = x
    let lineEndX = drawLeft ? x - LINE_LENGTH : x + LINE_LENGTH
    if (lineStartX > lineEndX) {
        ;[lineStartX, lineEndX] = [lineEndX, lineStartX]
    }

    const endX = roundToPhysicalPixel(lineEndX, dpr)
    const alignedY = alignToPhysicalPixelCenter(y, dpr)
    const textX = roundToPhysicalPixel(
        drawLeft ? x - LINE_LENGTH - PADDING : x + LINE_LENGTH + PADDING,
        dpr
    )

    return {
        x,
        y,
        price,
        text,
        textWidth,
        drawLeft,
        lineStartX,
        lineEndX,
        endX,
        alignedY,
        textX,
    }
}
