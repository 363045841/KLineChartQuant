import type { RendererPlugin, RenderContext } from '../../plugin'
import { RENDERER_PRIORITY } from '../../plugin'
import type { KLineData } from '../../types/price'
import { getKLineTrend, type kLineTrend } from '../../types/kLine'
import { createAlignedKLineFromPx, createVerticalLineRect } from '../draw/pixelAlign'
import { resolveThemeColors, type VolumePriceColors } from '../../tokens'
import { getPhysicalKLineConfig } from '../utils/klineConfig'
import { VolumePriceRelation } from '../../types/volumePrice'
import { analyzeVolumePriceRelationBatch, DEFAULT_VOLUME_PRICE_CONFIG } from '../../utils/volumePrice'
import type { MarkerManager } from '../marker/registry'

type CandleRenderData = {
    i: number
    aligned: ReturnType<typeof createAlignedKLineFromPx>
    trend: kLineTrend
    openY: number
    closeY: number
    highY: number
    lowY: number
    alignedHighY: number
    alignedLowY: number
    e: KLineData
}

type PreparedCandles = {
    upKLines: CandleRenderData[]
    downKLines: CandleRenderData[]
    upBodyBuf: Float32Array
    upBodyCount: number
    downBodyBuf: Float32Array
    downBodyCount: number
    upWickBuf: Float32Array
    upWickCount: number
    downWickBuf: Float32Array
    downWickCount: number
    wickWidth: number
    relations: VolumePriceRelation[] | null
    showVolumePriceMarkers: boolean
}

/**
 * 创建 K 线蜡烛图渲染器插件
 */
export function createCandleRenderer(): RendererPlugin {
    return {
        name: 'candle',
        version: '1.0.0',
        description: 'K线蜡烛图渲染器',
        debugName: 'K线',
        paneId: 'main',
        priority: RENDERER_PRIORITY.MAIN,

        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, kWidth, kGap, dpr, kLinePositions, markerManager, settings } = context
            const colors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)
            const klineData = data as KLineData[]
            if (!klineData.length) return

            const prepared = prepareCandles({
                pane,
                data: klineData,
                range,
                kWidth,
                kGap,
                dpr,
                kLinePositions,
                settings,
            })

            const usedWebGL = drawCandlesWithWebGL(context, prepared, colors.candleUpBody, colors.candleDownBody)
            if (!usedWebGL) {
                drawCandlesWithCanvas2D(ctx, scrollLeft, prepared, colors.candleUpBody, colors.candleDownBody)
            } else {
                compositeWebGLToMainCanvas(ctx, context)
            }

            drawVolumePriceMarkers(context, prepared, markerManager as MarkerManager | undefined)
        },
    }
}

function prepareCandles(args: {
    pane: RenderContext['pane']
    data: KLineData[]
    range: { start: number; end: number }
    kWidth: number
    kGap: number
    dpr: number
    kLinePositions: number[]
    settings?: RenderContext['settings']
}): PreparedCandles {
    const { pane, data, range, kWidth, kGap, dpr, kLinePositions, settings } = args
    const { kWidthPx } = getPhysicalKLineConfig(kWidth, kGap, dpr)
    const showVolumePriceMarkers = settings?.showVolumePriceMarkers !== false
    const relations = showVolumePriceMarkers
        ? analyzeVolumePriceRelationBatch(data, range.start, range.end, DEFAULT_VOLUME_PRICE_CONFIG)
        : null

    const upKLines: CandleRenderData[] = []
    const downKLines: CandleRenderData[] = []
    const maxRects = Math.max(1, range.end - range.start)
    const upBodyBuf = new Float32Array(maxRects * 4)
    const downBodyBuf = new Float32Array(maxRects * 4)
    const upWickBuf = new Float32Array(maxRects * 2 * 4)
    const downWickBuf = new Float32Array(maxRects * 2 * 4)
    let upBodyCount = 0
    let downBodyCount = 0
    let upWickCount = 0
    let downWickCount = 0

    // 预取 displayRange，避免循环内每根 K 线 4 次 getDisplayRange()
    const { maxPrice, minPrice } = pane.yAxis.getDisplayRange()
    const paddingTop = pane.yAxis.getPaddingTop()
    const paddingBottom = pane.yAxis.getPaddingBottom()
    const viewHeight = Math.max(1, pane.height - paddingTop - paddingBottom)
    const isLinear = pane.yAxis.getScaleType() === 'linear'
    let fastPriceToY: (price: number) => number
    if (isLinear) {
        const priceRange = maxPrice - minPrice || 1
        const scaleK = viewHeight / priceRange
        const scaleB = paddingTop + viewHeight
        fastPriceToY = (price: number) => scaleB - (price - minPrice) * scaleK
    } else {
        // 对数模式回退到标准方法
        fastPriceToY = (price: number) => pane.yAxis.priceToY(price)
    }

    for (let i = range.start; i < range.end && i < data.length; i++) {
        const e = data[i]
        if (!e) continue

        const openY = fastPriceToY(e.open)
        const closeY = fastPriceToY(e.close)
        const highY = fastPriceToY(e.high)
        const lowY = fastPriceToY(e.low)

        const leftLogical = kLinePositions[i - range.start]
        if (leftLogical === undefined) continue

        const alignY = (logical: number) => Math.round(logical * dpr) / dpr
        const alignedOpenY = alignY(openY)
        const alignedCloseY = alignY(closeY)
        const alignedHighY = alignY(highY)
        const alignedLowY = alignY(lowY)
        const alignedRawRectY = Math.min(alignedOpenY, alignedCloseY)
        const alignedRawRectH = Math.max(Math.abs(alignedOpenY - alignedCloseY), 1)

        const roundedLeftPx = Math.round(leftLogical * dpr)
        const aligned = createAlignedKLineFromPx(
            roundedLeftPx,
            alignedRawRectY,
            kWidthPx,
            alignedRawRectH,
            dpr
        )

        const trend: kLineTrend = getKLineTrend(e)
        const renderData: CandleRenderData = {
            i,
            aligned,
            trend,
            openY,
            closeY,
            highY,
            lowY,
            alignedHighY,
            alignedLowY,
            e,
        }

        const bodyRect = aligned.bodyRect
        const targetKLines = trend === 'up' ? upKLines : downKLines
        const isUp = trend === 'up'

        targetKLines.push(renderData)

        if (isUp) {
            const off = upBodyCount++ * 4
            upBodyBuf[off] = bodyRect.x
            upBodyBuf[off + 1] = bodyRect.y
            upBodyBuf[off + 2] = bodyRect.width
            upBodyBuf[off + 3] = bodyRect.height
        } else {
            const off = downBodyCount++ * 4
            downBodyBuf[off] = bodyRect.x
            downBodyBuf[off + 1] = bodyRect.y
            downBodyBuf[off + 2] = bodyRect.width
            downBodyBuf[off + 3] = bodyRect.height
        }

        const bodyTop = bodyRect.y
        const bodyBottom = bodyRect.y + bodyRect.height
        const bodyHigh = Math.max(e.open, e.close)
        const bodyLow = Math.min(e.open, e.close)

        if (e.high > bodyHigh) {
            const wick = createVerticalLineRect(aligned.wickRect.x, alignedHighY, bodyTop, dpr)
            if (wick) {
                const buf = isUp ? upWickBuf : downWickBuf
                const idx = isUp ? upWickCount++ : downWickCount++
                const off = idx * 4
                buf[off] = wick.x
                buf[off + 1] = wick.y
                buf[off + 2] = wick.width
                buf[off + 3] = wick.height
            }
        }
        if (e.low < bodyLow) {
            const wick = createVerticalLineRect(aligned.wickRect.x, bodyBottom, alignedLowY, dpr)
            if (wick) {
                const buf = isUp ? upWickBuf : downWickBuf
                const idx = isUp ? upWickCount++ : downWickCount++
                const off = idx * 4
                buf[off] = wick.x
                buf[off + 1] = wick.y
                buf[off + 2] = wick.width
                buf[off + 3] = wick.height
            }
        }
    }

    const wickWidth = upKLines[0]?.aligned.wickRect.width ?? downKLines[0]?.aligned.wickRect.width ?? 1

    return {
        upKLines,
        downKLines,
        upBodyBuf,
        upBodyCount,
        downBodyBuf,
        downBodyCount,
        upWickBuf,
        upWickCount,
        downWickBuf,
        downWickCount,
        wickWidth,
        relations,
        showVolumePriceMarkers,
    }
}

function drawCandlesWithCanvas2D(ctx: CanvasRenderingContext2D, scrollLeft: number, prepared: PreparedCandles, upColor: string, downColor: string): void {
    ctx.save()
    ctx.translate(-scrollLeft, 0)

    ctx.fillStyle = upColor
    for (let i = 0; i < prepared.upBodyCount; i++) {
        const off = i * 4
        ctx.fillRect(prepared.upBodyBuf[off], prepared.upBodyBuf[off + 1], prepared.upBodyBuf[off + 2], prepared.upBodyBuf[off + 3])
    }

    ctx.fillStyle = downColor
    for (let i = 0; i < prepared.downBodyCount; i++) {
        const off = i * 4
        ctx.fillRect(prepared.downBodyBuf[off], prepared.downBodyBuf[off + 1], prepared.downBodyBuf[off + 2], prepared.downBodyBuf[off + 3])
    }

    ctx.fillStyle = upColor
    for (let i = 0; i < prepared.upWickCount; i++) {
        const off = i * 4
        ctx.fillRect(prepared.upWickBuf[off], prepared.upWickBuf[off + 1], prepared.wickWidth, prepared.upWickBuf[off + 3])
    }

    ctx.fillStyle = downColor
    for (let i = 0; i < prepared.downWickCount; i++) {
        const off = i * 4
        ctx.fillRect(prepared.downWickBuf[off], prepared.downWickBuf[off + 1], prepared.wickWidth, prepared.downWickBuf[off + 3])
    }

    ctx.restore()
}

function drawCandlesWithWebGL(context: RenderContext, prepared: PreparedCandles, upColor: string, downColor: string): boolean {
    if (context.settings?.enableWebGLRendering === false) return false
    const surface = context.candleWebGLSurface
    if (!surface || !surface.isAvailable()) return false

    surface.clear()

    const bodyUpOk = prepared.upBodyCount === 0 || surface.drawRectBuffer(prepared.upBodyBuf.subarray(0, prepared.upBodyCount * 4), prepared.upBodyCount, upColor, context.scrollLeft)
    const bodyDownOk = prepared.downBodyCount === 0 || surface.drawRectBuffer(prepared.downBodyBuf.subarray(0, prepared.downBodyCount * 4), prepared.downBodyCount, downColor, context.scrollLeft)
    const wickUpOk = prepared.upWickCount === 0 || surface.drawRectBuffer(prepared.upWickBuf.subarray(0, prepared.upWickCount * 4), prepared.upWickCount, upColor, context.scrollLeft)
    const wickDownOk = prepared.downWickCount === 0 || surface.drawRectBuffer(prepared.downWickBuf.subarray(0, prepared.downWickCount * 4), prepared.downWickCount, downColor, context.scrollLeft)

    return bodyUpOk && bodyDownOk && wickUpOk && wickDownOk
}

function compositeWebGLToMainCanvas(ctx: CanvasRenderingContext2D, context: RenderContext): void {
    const surface = context.candleWebGLSurface
    if (!surface) return

    surface.compositeTo(ctx)
}

function drawVolumePriceMarkers(
    context: RenderContext,
    prepared: PreparedCandles,
    markerManager: MarkerManager | undefined
): void {
    const { ctx, range, kWidth, dpr } = context
    const colors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)
    if (!prepared.showVolumePriceMarkers || !markerManager || (context.zoomLevel ?? 1) < 2) {
        return
    }

    ctx.save()
    ctx.translate(-context.scrollLeft, 0)

    for (const k of prepared.upKLines) {
        const relation = prepared.relations?.[k.i - range.start]
        if (relation !== undefined && relation !== VolumePriceRelation.OTHERS) {
            const isRising = relation === VolumePriceRelation.RISE_WITH_VOLUME || relation === VolumePriceRelation.RISE_WITHOUT_VOLUME
            const markerY = isRising ? k.alignedHighY - 15 : k.alignedLowY + 15
            const posIndex = k.i - range.start
            const markerX = context.kLineCenters[posIndex]!
            drawVolumePriceMarker(ctx, markerX, markerY, relation, k.i, kWidth, 4, markerManager, dpr, colors.volumePrice)
        }
    }

    for (const k of prepared.downKLines) {
        const relation = prepared.relations?.[k.i - range.start]
        if (relation !== undefined && relation !== VolumePriceRelation.OTHERS) {
            const isRising = relation === VolumePriceRelation.RISE_WITH_VOLUME || relation === VolumePriceRelation.RISE_WITHOUT_VOLUME
            const markerY = isRising ? k.alignedHighY - 15 : k.alignedLowY + 15
            const posIndex = k.i - range.start
            const markerX = context.kLineCenters[posIndex]!
            drawVolumePriceMarker(ctx, markerX, markerY, relation, k.i, kWidth, 4, markerManager, dpr, colors.volumePrice)
        }
    }

    ctx.restore()
}

/**
* 绘制量价关系标记
* 在K线图上标注量价关系标记符号
*
* @param ctx - Canvas绘图上下文
* @param x - 标记的x坐标（三角形水平中心）
* @param y - 标记的y坐标（三角形底边/顶点与K线的接触点）
* @param relation - 量价关系类型
* @param kWidth - K线宽度，作为三角形边长
* @param gap - 三角形与K线的间距，默认为4
* @param dpr - 设备像素比
*/
function drawVolumePriceMarker(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    relation: VolumePriceRelation,
    kIndex: number,
    kWidth: number,
    gap: number = 4,
    markerManager: MarkerManager,
    dpr: number,
    volumePriceColors: VolumePriceColors
): void {
    const align = (v: number) => Math.round(v * dpr) / dpr
    x = align(x)
    y = align(y)

    const sideLength = Math.min(kWidth, 20)
    const height = sideLength * Math.sqrt(3) / 2

    let color: string
    let isUp: boolean

    switch (relation) {
        case VolumePriceRelation.RISE_WITH_VOLUME:
            color = volumePriceColors.riseWith
            isUp = true
            break
        case VolumePriceRelation.RISE_WITHOUT_VOLUME:
            color = volumePriceColors.riseWithout
            isUp = true
            break
        case VolumePriceRelation.FALL_WITH_VOLUME:
            color = volumePriceColors.fallWith
            isUp = false
            break
        case VolumePriceRelation.FALL_WITHOUT_VOLUME:
            color = volumePriceColors.fallWithout
            isUp = false
            break
        default:
            return
    }

    ctx.save()
    ctx.beginPath()

    if (isUp) {
        const baseY = align(y - gap)
        const tipY = align(baseY - height)

        ctx.moveTo(x, tipY)
        ctx.lineTo(align(x - sideLength / 2), baseY)
        ctx.lineTo(align(x + sideLength / 2), baseY)
    } else {
        const baseY = align(y + gap)
        const tipY = align(baseY + height)

        ctx.moveTo(x, tipY)
        ctx.lineTo(align(x - sideLength / 2), baseY)
        ctx.lineTo(align(x + sideLength / 2), baseY)
    }

    ctx.closePath()

    ctx.fillStyle = color
    ctx.fill()

    ctx.restore()

    let boundingX: number
    let boundingY: number

    if (isUp) {
        const baseY = align(y - gap)
        const tipY = align(baseY - height)
        boundingX = align(x - sideLength / 2)
        boundingY = tipY
    } else {
        const baseY = align(y + gap)
        const tipY = align(baseY + height)
        boundingX = align(x - sideLength / 2)
        boundingY = baseY
    }

    let markerTypeKey: string
    switch (relation) {
        case VolumePriceRelation.RISE_WITH_VOLUME:
            markerTypeKey = 'RISE_WITH_VOLUME'
            break
        case VolumePriceRelation.RISE_WITHOUT_VOLUME:
            markerTypeKey = 'RISE_WITHOUT_VOLUME'
            break
        case VolumePriceRelation.FALL_WITH_VOLUME:
            markerTypeKey = 'FALL_WITH_VOLUME'
            break
        case VolumePriceRelation.FALL_WITHOUT_VOLUME:
            markerTypeKey = 'FALL_WITHOUT_VOLUME'
            break
        default:
            return
    }

    const markerId = `mk_price-volume_${kIndex}`
    markerManager.register({
        id: markerId,
        type: 'triangle',
        markerType: markerTypeKey,
        x: boundingX,
        y: boundingY,
        width: sideLength,
        height: height,
        dataIndex: kIndex,
        metadata: { relation }
    })
}
