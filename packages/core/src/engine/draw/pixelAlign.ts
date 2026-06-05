/**
 * 像素对齐工具函数 - 逻辑像素空间（配合 ctx.scale(dpr) 使用）
 */

/**
 * 将逻辑坐标对齐到物理像素边界（用于矩形填充）
 * @param value - 逻辑坐标值
 * @param dpr - 设备像素比
 * @returns 对齐后的逻辑坐标
 */
export function roundToPhysicalPixel(value: number, dpr: number, theme?: 'light' | 'dark'): number {
    return Math.round(value * dpr) / dpr
}

/**
 * 将逻辑坐标对齐到物理像素中心（用于 1px 线条）
 * @param value - 逻辑坐标值
 * @param dpr - 设备像素比
 * @returns 对齐后的逻辑坐标
 */
export function alignToPhysicalPixelCenter(value: number, dpr: number, theme?: 'light' | 'dark'): number {
    return (Math.floor(value * dpr) + 0.5) / dpr
}

/**
 * 对齐矩形到物理像素边界
 * @param x - 矩形左边界 X 坐标
 * @param y - 矩形顶部 Y 坐标
 * @param width - 矩形宽度
 * @param height - 矩形高度
 * @param dpr - 设备像素比
 * @returns 对齐后的矩形信息
 */
export function alignRect(
    x: number,
    y: number,
    width: number,
    height: number,
    dpr: number,
    theme?: 'light' | 'dark'
): { x: number; y: number; width: number; height: number } {
    const alignedX = roundToPhysicalPixel(x, dpr)
    const alignedY = roundToPhysicalPixel(y, dpr)
    const alignedEndX = roundToPhysicalPixel(x + width, dpr)
    const alignedEndY = roundToPhysicalPixel(y + height, dpr)

    return {
        x: alignedX,
        y: alignedY,
        width: Math.max(1 / dpr, alignedEndX - alignedX),
        height: Math.max(1 / dpr, alignedEndY - alignedY),
    }
}

/**
 * 创建用于绘制垂直线的矩形（1 物理像素宽）
 * @param centerX - 垂直线中心 X 坐标
 * @param y1 - 垂直线起始点 Y 坐标
 * @param y2 - 垂直线结束点 Y 坐标
 * @param dpr - 设备像素比
 * @returns 对齐到物理像素的矩形信息，如果 y1 和 y2 相等则返回 null
 */
export function createVerticalLineRect(
    centerX: number,
    y1: number,
    y2: number,
    dpr: number,
    theme?: 'light' | 'dark'
): { x: number; y: number; width: number; height: number } | null {
    if (y1 === y2) return null

    const top = Math.min(y1, y2)
    const bottom = Math.max(y1, y2)

    // 转换到物理像素空间取整，再转回逻辑像素
    const physX = Math.round(centerX * dpr)
    const physTop = Math.round(top * dpr)
    const physBottom = Math.round(bottom * dpr)

    return {
        x: physX / dpr,
        y: physTop / dpr,
        width: 1 / dpr,
        height: Math.max(1, physBottom - physTop) / dpr,
    }
}

/**
 * 创建用于绘制水平线的矩形（1 物理像素高）
 * @param x1 - 水平线起始点的 X 坐标
 * @param x2 - 水平线结束点的 X 坐标
 * @param centerY - 水平线中心 Y 坐标
 * @param dpr - 设备像素比
 * @returns 对齐到物理像素的矩形信息，如果 x1 和 x2 相等则返回 null
 */
export function createHorizontalLineRect(
    x1: number,
    x2: number,
    centerY: number,
    dpr: number,
    theme?: 'light' | 'dark'
): { x: number; y: number; width: number; height: number } | null {
    if (x1 === x2) return null

    const left = Math.min(x1, x2)
    const right = Math.max(x1, x2)

    const physLeft = Math.round(left * dpr)
    const physRight = Math.round(right * dpr)
    const physY = Math.round(centerY * dpr)

    return {
        x: physLeft / dpr,
        y: physY / dpr,
        width: Math.max(1, physRight - physLeft) / dpr,
        height: 1 / dpr,
    }
}

/**
 * 创建对齐的K线实体和影线
 * @param rectX - 实体左边界 X 坐标（逻辑像素）
 * @param rectY - 实体顶部 Y 坐标（逻辑像素）
 * @param kWidth - 实体宽度（逻辑像素）
 * @param height - 实体高度（逻辑像素）
 * @param dpr - 设备像素比
 * @returns 对齐后的实体和影线信息
 */
export function createAlignedKLine(
    rectX: number,
    rectY: number,
    kWidth: number,
    height: number,
    dpr: number,
    theme?: 'light' | 'dark'
): {
    bodyRect: { x: number; y: number; width: number; height: number }
    physBodyLeft: number
    physBodyRight: number
    physBodyWidth: number
    physBodyCenter: number
    physWickX: number
    wickRect: { x: number; width: number }
    isPerfectlyAligned: boolean
} {
    // 1. 统一在物理像素空间计算，避免二次round
    
    // 1.1 左边界：round到整数像素列
    const leftPx = Math.round(rectX * dpr)
    
    // 1.2 宽度：round到整数，并确保是奇数
    let widthPx = Math.round(kWidth * dpr)
    if (widthPx % 2 === 0) {
        widthPx += 1
    }
    widthPx = Math.max(1, widthPx)
    
    // 1.3 右边界：由左边界+宽度决定
    const rightPx = leftPx + widthPx
    
    // 1.4 物理宽度
    const physBodyWidth = widthPx
    
    // 2. Y轴对齐
    const topPx = Math.round(rectY * dpr)
    const bottomPx = Math.round((rectY + height) * dpr)
    const heightPx = Math.max(1, bottomPx - topPx)
    
    // 3. 计算物理中心和影线位置
    const physWickX = leftPx + (widthPx - 1) / 2
    const physBodyCenter = physWickX
    const isPerfectlyAligned = physBodyWidth % 2 === 1
    
    // 4. 返回逻辑像素坐标
    return {
        bodyRect: {
            x: leftPx / dpr,
            y: topPx / dpr,
            width: widthPx / dpr,
            height: heightPx / dpr,
        },
        physBodyLeft: leftPx,
        physBodyRight: rightPx,
        physBodyWidth,
        physBodyCenter,
        physWickX,
        wickRect: {
            x: physWickX / dpr,
            width: 1 / dpr,
        },
        isPerfectlyAligned,
    }
}

/**
 * 创建对齐的K线实体和影线（物理像素直接版）
 * @param leftPx - 实体左边界物理像素坐标（整数）
 * @param rectY - 实体顶部 Y 坐标（逻辑像素）
 * @param widthPx - 实体宽度物理像素（奇数）
 * @param height - 实体高度（逻辑像素）
 * @param dpr - 设备像素比
 * @returns 对齐后的实体和影线信息
 */
export function createAlignedKLineFromPx(
    leftPx: number,
    rectY: number,
    widthPx: number,
    height: number,
    dpr: number,
    theme?: 'light' | 'dark'
): {
    bodyRect: { x: number; y: number; width: number; height: number }
    physBodyLeft: number
    physBodyRight: number
    physBodyWidth: number
    physBodyCenter: number
    physWickX: number
    wickRect: { x: number; width: number }
    isPerfectlyAligned: boolean
} {
    // 1. 物理像素空间计算
    
    // 1.1 左边界直接使用传入的整数
    // 1.2 宽度直接使用传入的奇数
    // 1.3 右边界由左边界+宽度决定
    const rightPx = leftPx + widthPx
    const physBodyWidth = widthPx
    
    // 2. Y轴对齐
    const topPx = Math.round(rectY * dpr)
    const bottomPx = Math.round((rectY + height) * dpr)
    const heightPx = Math.max(1, bottomPx - topPx)
    
    // 3. 计算影线位置
    const physWickX = leftPx + (widthPx - 1) / 2
    const physBodyCenter = physWickX
    const isPerfectlyAligned = physBodyWidth % 2 === 1

    // 4. 返回逻辑像素坐标
    return {
        bodyRect: {
            x: leftPx / dpr,
            y: topPx / dpr,
            width: widthPx / dpr,
            height: heightPx / dpr,
        },
        physBodyLeft: leftPx,
        physBodyRight: rightPx,
        physBodyWidth,
        physBodyCenter,
        physWickX,
        wickRect: {
            x: physWickX / dpr,
            width: 1 / dpr,
        },
        isPerfectlyAligned,
    }
}