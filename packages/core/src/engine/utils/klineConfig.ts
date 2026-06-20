/**
 * K 线物理像素配置工具函数
 * 用于统一渲染、交互、视口计算的坐标系统
 */

/**
 * 计算奇数化后的 K 线宽度（物理像素），确保影线能完美居中显示
 * @param kWidth K 线宽度（逻辑像素）
 * @param dpr 设备像素比
 * @returns 奇数化后的物理像素宽度
 */
export function calcKWidthPx(kWidth: number, dpr: number): number {
    return Math.max(1, Math.round(kWidth * dpr))
}

/**
 * 获取图表渲染使用的物理像素配置
 * @param kWidth K 线宽度（逻辑像素）
 * @param kGap K 线间隙（逻辑像素）
 * @param dpr 设备像素比
 * @returns 物理像素和逻辑像素的配置对象
 */
export function getPhysicalKLineConfig(kWidth: number, kGap: number, dpr: number) {
    const kWidthPx = calcKWidthPx(kWidth, dpr)
    const kGapPx = Math.round(kGap * dpr)
    const unitPx = kWidthPx + kGapPx
    const startXPx = kGapPx

    // 转回逻辑像素（供需要逻辑像素的地方使用）
    const kWidthLogical = kWidthPx / dpr
    const kGapLogical = kGapPx / dpr
    const unitLogical = unitPx / dpr
    const startXLogical = startXPx / dpr

    return {
        kWidthPx,
        kGapPx,
        unitPx,
        startXPx,
        kWidthLogical,
        kGapLogical,
        unitLogical,
        startXLogical,
    }
}
