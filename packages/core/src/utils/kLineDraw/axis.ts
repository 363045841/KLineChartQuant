import type { KLineData } from '../../types/price'
import { priceToY, yToPrice } from '../priceToY'
import { alignToPhysicalPixelCenter, roundToPhysicalPixel } from '../../engine/draw/pixelAlign'
import { formatYMDShanghai, formatMonthOrYear, findMonthBoundaries } from '../../utils/dateFormat'
import { resolveThemeColors } from '../../tokens'
import type { ColorPresetSettings } from '../../tokens'
import { getFont, setCanvasFont } from '../../engine/theme/fonts'

const textWidthCache = new Map<string, number>()
const TEXT_WIDTH_CACHE_LIMIT = 512

function measureTextWidth(ctx: CanvasRenderingContext2D, text: string): number {
    const key = `${ctx.font}\n${text}`
    const cached = textWidthCache.get(key)
    if (cached !== undefined) {
        return cached
    }

    const width = ctx.measureText(text).width
    if (textWidthCache.size >= TEXT_WIDTH_CACHE_LIMIT) {
        textWidthCache.clear()
    }
    textWidthCache.set(key, width)
    return width
}

export interface PriceAxisOptions {
    x: number
    y: number
    width: number
    height: number
    priceRange: { maxPrice: number; minPrice: number }
    yPaddingPx?: number
    dpr: number
    ticks?: number
    bgColor?: string
    textColor?: string
    lineColor?: string
    fontSize?: number
    paddingX?: number
    /** 是否绘制左侧边界竖线（默认 true） */
    drawLeftBorder?: boolean
    /** 是否绘制刻度短线（默认 true） */
    drawTickLines?: boolean
    /** 价格偏移量（用于价格轴平移时同步显示） */
    priceOffset?: number
}

/** 右侧价格轴（固定，不随 translate/scroll 变化） */
export function drawPriceAxis(ctx: CanvasRenderingContext2D, opts: PriceAxisOptions, theme: 'light' | 'dark' = 'light', isAsiaMarket?: boolean, colorPresetSettings?: ColorPresetSettings) {
    const colors = resolveThemeColors(theme, isAsiaMarket, colorPresetSettings)
    const {
        x,
        y,
        width,
        height,
        priceRange,
        yPaddingPx = 0,
        dpr,
        ticks = 10,
        bgColor = colors.tagBg.transparent,
        textColor = colors.text.secondary,
        lineColor = colors.border.dark,
        fontSize = 16,
        drawLeftBorder = true,
        drawTickLines = true,
        priceOffset = 0,
    } = opts

    const wantPad = yPaddingPx
    const pad = Math.max(0, Math.min(wantPad, Math.floor(height / 2) - 1))

    const { maxPrice, minPrice } = priceRange
    const range = maxPrice - minPrice
    const step = range === 0 ? 0 : range / (Math.max(2, ticks) - 1)

    ctx.fillStyle = bgColor
    ctx.fillRect(x, y, width, height)

    if (drawLeftBorder) {
        ctx.strokeStyle = lineColor
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(alignToPhysicalPixelCenter(x, dpr), y)
        ctx.lineTo(alignToPhysicalPixelCenter(x, dpr), y + height)
        ctx.stroke()
    }

    setCanvasFont(ctx, getFont(fontSize))
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.strokeStyle = lineColor
    ctx.fillStyle = textColor

    const centerX = x + width / 2

    for (let i = 0; i < Math.max(2, ticks); i++) {
        const p = range === 0 ? maxPrice : maxPrice - step * i
        const yy = Math.round(priceToY(p, maxPrice, minPrice, height, pad, pad) + y)

        if (drawTickLines) {
            ctx.beginPath()
            const lineY = alignToPhysicalPixelCenter(yy, dpr)
            ctx.moveTo(x, lineY)
            ctx.lineTo(x + 4, lineY)
            ctx.stroke()
        }

        const displayPrice = p + priceOffset
        ctx.fillText(displayPrice.toFixed(2), roundToPhysicalPixel(centerX, dpr), alignToPhysicalPixelCenter(yy, dpr))
    }
}

export interface TimeAxisOptions {
    x: number
    y: number
    width: number
    height: number
    data: KLineData[]
    scrollLeft: number
    kWidth: number
    kGap: number
    startIndex: number
    endIndex: number
    dpr: number
    bgColor?: string
    textColor?: string
    lineColor?: string
    fontSize?: number
    /** 左右内边距（逻辑像素），避免月份/年份文字贴边 */
    paddingX?: number
    /** 是否绘制顶部边界线（默认 true，如果主图已有底边框则设为 false 避免重复） */
    drawTopBorder?: boolean
    /** 是否绘制底部边界线（默认 true，如果副图已有下边框则设为 false 避免重复） */
    drawBottomBorder?: boolean
}

export interface LastPriceLineOptions {
    /** 绘图区宽度（逻辑像素） */
    plotWidth: number
    /** 绘图区高度（逻辑像素） */
    plotHeight: number
    /** 当前滚动位置（逻辑像素） */
    scrollLeft: number
    /** 可视范围：用于确定虚线的起止 worldX */
    startIndex: number
    endIndex: number
    /** K线布局 */
    kWidth: number
    kGap: number
    /** 价格范围 */
    priceRange: { maxPrice: number; minPrice: number }
    /** 最新价 */
    lastPrice: number
    /** Y轴 padding（与绘图区一致） */
    yPaddingPx?: number
    dpr: number
    color?: string
}

export interface CrosshairPriceLabelOptions {
    x: number
    y: number
    width: number
    height: number
    /** 十字线的 y（相对该 canvas 的逻辑像素坐标） */
    crosshairY: number
    priceRange: { maxPrice: number; minPrice: number }
    yPaddingPx?: number
    dpr: number
    bgColor?: string
    borderColor?: string
    textColor?: string
    fontSize?: number
    paddingX?: number
    /** 价格偏移量（用于价格轴平移时同步显示） */
    priceOffset?: number
    /** 优先显示的价格（如十字线已按 active pane 算好） */
    price?: number
    formatPrice?: (price: number) => string
}

export interface CrosshairTimeLabelOptions {
    x: number
    y: number
    width: number
    height: number
    /** 十字线的 x（相对该 canvas 的逻辑像素坐标） */
    crosshairX: number
    /** 命中的交易日时间戳（毫秒） */
    timestamp: number
    dpr: number
    bgColor?: string
    textColor?: string
    fontSize?: number
    paddingX?: number
    paddingY?: number
}

export function drawCrosshairTimeLabel(ctx: CanvasRenderingContext2D, opts: CrosshairTimeLabelOptions, theme: 'light' | 'dark' = 'light', isAsiaMarket?: boolean, colorPresetSettings?: ColorPresetSettings) {
    const colors = resolveThemeColors(theme, isAsiaMarket, colorPresetSettings)
    const {
        x,
        y,
        width,
        height,
        crosshairX,
        timestamp,
        dpr,
        fontSize = 16,
        paddingX = 8,
    } = opts

    const text = formatYMDShanghai(timestamp)

    ctx.save()
    setCanvasFont(ctx, getFont(fontSize))
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'

    const tw = Math.round(measureTextWidth(ctx, text))
    const rectW = Math.min(width, tw + paddingX * 2)
    const rectH = height

    const centerX = Math.min(Math.max(crosshairX, x + rectW / 2), x + width - rectW / 2)
    const centerY = y + height / 2

    const rectX = centerX - rectW / 2
    const rectY = y

    ctx.fillStyle = colors.label.bg
    ctx.fillRect(
        roundToPhysicalPixel(rectX, dpr),
        roundToPhysicalPixel(rectY, dpr),
        roundToPhysicalPixel(rectW, dpr),
        roundToPhysicalPixel(rectH, dpr),
    )

    ctx.fillStyle = colors.label.text
    ctx.fillText(text, roundToPhysicalPixel(centerX, dpr), alignToPhysicalPixelCenter(centerY, dpr))

    ctx.restore()
}

export function drawCrosshairPriceLabel(ctx: CanvasRenderingContext2D, opts: CrosshairPriceLabelOptions, theme: 'light' | 'dark' = 'light', isAsiaMarket?: boolean, colorPresetSettings?: ColorPresetSettings) {
    const colors = resolveThemeColors(theme, isAsiaMarket, colorPresetSettings)
    const {
        x,
        y,
        width,
        height,
        crosshairY,
        priceRange,
        yPaddingPx = 0,
        dpr,
        bgColor = colors.label.bg,
        borderColor,
        textColor = colors.label.text,
        fontSize = 16,
        priceOffset = 0,
        price,
        formatPrice,
    } = opts

    const pad = Math.max(0, Math.min(yPaddingPx, Math.floor(height / 2) - 1))
    const { maxPrice, minPrice } = priceRange
    const displayPrice = price ?? (yToPrice(crosshairY - y, maxPrice, minPrice, height, pad, pad) + priceOffset)
    const priceText = formatPrice ? formatPrice(displayPrice) : displayPrice.toFixed(2)

    ctx.save()
    setCanvasFont(ctx, getFont(fontSize))
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'

    const textH = fontSize + 4
    const rectH = textH

    const yy = Math.min(Math.max(crosshairY, y + rectH / 2), y + height - rectH / 2)
    const rectY = yy - rectH / 2

    const rx = x
    const ry = roundToPhysicalPixel(rectY, dpr)
    const rw = width
    const rh = roundToPhysicalPixel(rectH, dpr)
    ctx.fillStyle = bgColor
    ctx.fillRect(rx, ry, rw, rh)

    if (borderColor) {
        ctx.strokeStyle = borderColor
        ctx.lineWidth = 1
        ctx.strokeRect(
            alignToPhysicalPixelCenter(rx, dpr),
            alignToPhysicalPixelCenter(ry, dpr),
            Math.max(0, rw - 1 / dpr),
            Math.max(0, rh - 1 / dpr)
        )
    }

    const centerX = x + width / 2
    ctx.fillStyle = textColor
    ctx.fillText(priceText, roundToPhysicalPixel(centerX, dpr), alignToPhysicalPixelCenter(yy, dpr))

    ctx.restore()
}

/** 绘制"最新价水平虚线"（画在 plotCanvas 的 world 坐标系：需在 translate(-scrollLeft,0) 之后调用） */
export function drawLastPriceDashedLine(ctx: CanvasRenderingContext2D, opts: LastPriceLineOptions, theme: 'light' | 'dark' = 'light', isAsiaMarket?: boolean, colorPresetSettings?: ColorPresetSettings) {
    const colors = resolveThemeColors(theme, isAsiaMarket, colorPresetSettings)
    const {
        plotWidth,
        plotHeight,
        scrollLeft,
        startIndex,
        endIndex,
        kWidth,
        kGap,
        priceRange,
        lastPrice,
        yPaddingPx = 0,
        dpr,
        color = colors.crosshairLine,
    } = opts

    const { maxPrice, minPrice } = priceRange
    if (!(lastPrice >= minPrice && lastPrice <= maxPrice)) return

    const pad = Math.max(0, Math.min(yPaddingPx, Math.floor(plotHeight / 2) - 1))
    const y = priceToY(lastPrice, maxPrice, minPrice, plotHeight, pad, pad)

    const unit = kWidth + kGap
    const startX = kGap + startIndex * unit
    const endX = kGap + endIndex * unit

    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    const yy = alignToPhysicalPixelCenter(y, dpr)
    ctx.moveTo(roundToPhysicalPixel(startX, dpr), yy)
    ctx.lineTo(roundToPhysicalPixel(endX, dpr), yy)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
}

/** 底部时间轴（X方向随 scrollLeft 变化） */
export function drawTimeAxis(ctx: CanvasRenderingContext2D, opts: TimeAxisOptions, theme: 'light' | 'dark' = 'light', isAsiaMarket?: boolean, colorPresetSettings?: ColorPresetSettings) {
    const colors = resolveThemeColors(theme, isAsiaMarket, colorPresetSettings)
    const {
        x,
        y,
        width,
        height,
        data,
        scrollLeft,
        kWidth,
        kGap,
        startIndex,
        endIndex,
        dpr,
        bgColor = colors.tagBg.transparent,
        textColor = colors.text.secondary,
        lineColor = colors.border.dark,
        fontSize = 12,
        paddingX = 8,
        drawTopBorder = true,
        drawBottomBorder = true,
    } = opts

    const physKWidth = Math.round(kWidth * dpr)
    const alignedPhysKWidth = physKWidth % 2 === 0 ? physKWidth + 1 : physKWidth
    const physKGap = Math.round(kGap * dpr)
    const unitPx = alignedPhysKWidth + physKGap
    const startXPx = physKGap

    const unit = unitPx / dpr
    const startX = startXPx / dpr
    const alignedKWidth = alignedPhysKWidth / dpr

    ctx.fillStyle = bgColor
    ctx.fillRect(x, y, width, height)

    if (drawTopBorder) {
        ctx.strokeStyle = lineColor
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, alignToPhysicalPixelCenter(y, dpr))
        ctx.lineTo(x + width, alignToPhysicalPixelCenter(y, dpr))
        ctx.stroke()
    }

    if (drawBottomBorder) {
        ctx.strokeStyle = lineColor
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, alignToPhysicalPixelCenter(y + height, dpr))
        ctx.lineTo(x + width, alignToPhysicalPixelCenter(y + height, dpr))
        ctx.stroke()
    }

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = textColor
    const textY = y + height / 2
    const regularFont = getFont(fontSize)
    const boldFont = getFont(fontSize, { bold: true })

    const boundaries = findMonthBoundaries(data)
    const visibleBoundaries = boundaries.filter((idx: number) => idx >= startIndex && idx < endIndex)

    let lastWasYear: boolean | null = null

    for (const idx of visibleBoundaries) {
        const k = data[idx]
        if (!k) continue

        const worldX = startX + idx * unit + alignedKWidth / 2
        const screenX = worldX - scrollLeft

        const minX = paddingX
        const maxX = Math.max(paddingX, width - paddingX)

        if (screenX >= minX && screenX <= maxX) {
            const drawX = Math.min(Math.max(screenX, minX), maxX)
            const { text, isYear } = formatMonthOrYear(k.timestamp)
            if (lastWasYear !== isYear) {
                setCanvasFont(ctx, isYear ? boldFont : regularFont)
                lastWasYear = isYear
            }
            ctx.fillText(text, roundToPhysicalPixel(drawX, dpr), alignToPhysicalPixelCenter(textY, dpr))
        }
    }
}

/** ============ 轴标签绘制函数 ============ */

export interface AxisPriceLabelOptions {
    x: number
    y: number
    width: number
    height: number
    priceY: number
    price: number
    dpr: number
    bgColor?: string
    borderColor?: string
    textColor?: string
    fontSize?: number
}

export function drawAxisPriceLabel(ctx: CanvasRenderingContext2D, opts: AxisPriceLabelOptions, theme: 'light' | 'dark' = 'light', isAsiaMarket?: boolean, colorPresetSettings?: ColorPresetSettings) {
    const colors = resolveThemeColors(theme, isAsiaMarket, colorPresetSettings)
    const {
        x,
        y,
        width,
        height,
        priceY,
        price,
        dpr,
        bgColor = colors.label.bg,
        borderColor,
        textColor = colors.label.text,
        fontSize = 12,
    } = opts

    const priceText = price.toFixed(2)

    ctx.save()
    setCanvasFont(ctx, getFont(fontSize))
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'

    const textH = fontSize + 4
    const rectH = textH

    const yy = Math.min(Math.max(priceY, y + rectH / 2), y + height - rectH / 2)
    const rectY = yy - rectH / 2

    const rx = x
    const ry = roundToPhysicalPixel(rectY, dpr)
    const rw = width
    const rh = roundToPhysicalPixel(rectH, dpr)
    ctx.fillStyle = bgColor
    ctx.fillRect(rx, ry, rw, rh)

    if (borderColor) {
        ctx.strokeStyle = borderColor
        ctx.lineWidth = 1
        ctx.strokeRect(
            alignToPhysicalPixelCenter(rx, dpr),
            alignToPhysicalPixelCenter(ry, dpr),
            Math.max(0, rw - 1 / dpr),
            Math.max(0, rh - 1 / dpr)
        )
    }

    const centerX = x + width / 2
    ctx.fillStyle = textColor
    ctx.fillText(priceText, roundToPhysicalPixel(centerX, dpr), alignToPhysicalPixelCenter(yy, dpr))

    ctx.restore()
}

export interface AxisTimeLabelOptions {
    x: number
    y: number
    width: number
    height: number
    labelX: number
    timestamp: number
    dpr: number
    bgColor?: string
    textColor?: string
    fontSize?: number
    paddingX?: number
}

export function drawAxisTimeLabel(ctx: CanvasRenderingContext2D, opts: AxisTimeLabelOptions, theme: 'light' | 'dark' = 'light', isAsiaMarket?: boolean, colorPresetSettings?: ColorPresetSettings) {
    const colors = resolveThemeColors(theme, isAsiaMarket, colorPresetSettings)
    const {
        x,
        y,
        width,
        height,
        labelX,
        timestamp,
        dpr,
        fontSize = 12,
        paddingX = 8,
    } = opts

    const text = formatYMDShanghai(timestamp)

    ctx.save()
    setCanvasFont(ctx, getFont(fontSize))
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'

    const tw = Math.round(measureTextWidth(ctx, text))
    const rectW = Math.min(width, tw + paddingX * 2)
    const rectH = height

    const centerX = Math.min(Math.max(labelX, x + rectW / 2), x + width - rectW / 2)
    const centerY = y + height / 2

    const rectX = centerX - rectW / 2
    const rectY = y

    ctx.fillStyle = opts.bgColor ?? colors.label.bg
    ctx.fillRect(
        roundToPhysicalPixel(rectX, dpr),
        roundToPhysicalPixel(rectY, dpr),
        roundToPhysicalPixel(rectW, dpr),
        roundToPhysicalPixel(rectH, dpr),
    )

    ctx.fillStyle = opts.textColor ?? colors.label.text
    ctx.fillText(text, roundToPhysicalPixel(centerX, dpr), alignToPhysicalPixelCenter(centerY, dpr))

    ctx.restore()
}
