import type { PriceRange } from './price'
import type { ScaleType } from '../utils/tickPosition'
import {
    type LogFormula,
    toLog,
    fromLog,
    logFormulaForPriceRange,
    logFormulasAreSame,
} from './logFormula'

/**
 * Pane 级别的价格坐标系（价格 -> pane 内 Y）
 * - y=0 在 pane 顶部，y=height 在 pane 底部
 */
export class PriceScale {
    private range: PriceRange = { maxPrice: 100, minPrice: 0 }
    private height = 1
    private paddingTop = 0
    private paddingBottom = 0

    /** 价格偏移量（用于上下拖动平移价格轴）
     * 在对数模式下，此偏移量为 log 空间偏移 */
    private priceOffset = 0

    /** 垂直缩放系数（1=默认，>1 放大，<1 缩小） */
    private verticalScale = 1

    /** 刻度类型：线性或对数 */
    private scaleType: ScaleType = 'linear'

    /** 对数变换公式（动态计算，适配极小价格） */
    private logFormula: LogFormula = logFormulaForPriceRange(null)

    /** 百分比轴基准价（visibleRange 第一根 K 线的 close） */
    private basePrice: number | null = null

    /** 获取百分比轴基准价 */
    getBasePrice(): number | null {
        return this.basePrice
    }

    /** 设置百分比轴基准价 */
    setBasePrice(price: number | null): void {
        this.basePrice = price
    }

    /** 价格 → 百分比空间 */
    toPercent(price: number): number {
        if (this.basePrice === null || this.basePrice === 0) return 0
        return ((price - this.basePrice) / this.basePrice) * 100
    }

    /** 百分比空间 → 价格 */
    fromPercent(pct: number): number {
        if (this.basePrice === null || this.basePrice === 0) return 0
        return this.basePrice * (1 + pct / 100)
    }

    /** 获取当前 displayRange 的百分比范围（用于 yAxis 刻度显示） */
    getDisplayPercentRange(): { minPct: number; maxPct: number } {
        const { maxPrice, minPrice } = this.getDisplayRange()
        return {
            minPct: this.toPercent(minPrice),
            maxPct: this.toPercent(maxPrice),
        }
    }

    private isPercent(): boolean {
        return this.scaleType === 'percent' && this.basePrice !== null && this.basePrice > 0
    }

    private isLog(): boolean {
        return this.scaleType === 'log' && this.range.minPrice > 0
    }

    private toNative(price: number): number {
        if (this.isLog()) return toLog(price, this.logFormula)
        if (this.isPercent()) return this.toPercent(price)
        return price
    }

    private fromNative(n: number): number {
        if (this.isLog()) return fromLog(n, this.logFormula)
        if (this.isPercent()) return this.fromPercent(n)
        return n
    }

    private nativeRange(): number {
        return this.toNative(this.range.maxPrice) - this.toNative(this.range.minPrice)
    }

    setRange(r: PriceRange) {
        this.range = r
        if (this.scaleType === 'log' && r.minPrice > 0) {
            const newFormula = logFormulaForPriceRange(r)
            if (!logFormulasAreSame(newFormula, this.logFormula)) {
                // 将旧公式的 log 偏移量转换到新公式空间
                const oldLogMin = toLog(r.minPrice, this.logFormula)
                const oldLogMax = toLog(r.maxPrice, this.logFormula)
                const oldCenter = (oldLogMax + oldLogMin) / 2 + this.priceOffset

                this.logFormula = newFormula

                const newLogMin = toLog(r.minPrice, this.logFormula)
                const newLogMax = toLog(r.maxPrice, this.logFormula)
                const newBaseCenter = (newLogMax + newLogMin) / 2
                this.priceOffset = this.clampOffset(oldCenter - newBaseCenter)
            }
        }
    }

    setHeight(h: number) {
        this.height = Math.max(1, h)
    }

    setPadding(top: number, bottom: number) {
        this.paddingTop = Math.max(0, top)
        this.paddingBottom = Math.max(0, bottom)
    }

    getRange(): PriceRange {
        return this.range
    }

    getPaddingTop(): number {
        return this.paddingTop
    }

    getPaddingBottom(): number {
        return this.paddingBottom
    }

    /**
     * 设置价格偏移量
     * @param offset 价格偏移
     *   - 线性模式：真实价格的线性偏移
     *   - 对数模式：log 空间的偏移量
     */
    setPriceOffset(offset: number): void {
        this.priceOffset = this.clampOffset(offset)
    }

    /**
     * 获取当前价格偏移量
     */
    getPriceOffset(): number {
        return this.priceOffset
    }

    /**
     * 重置价格偏移量
     */
    resetPriceOffset(): void {
        this.priceOffset = 0
    }

    resetTransform(): void {
        this.priceOffset = 0
        this.verticalScale = 1
    }

    /**
     * 根据当前 range 和 verticalScale 对 priceOffset 进行 clamp，
     * 防止视口完全离开数据范围。
     */
    private clampOffset(offset: number): number {
        const nativeRange = this.nativeRange()
        if (nativeRange <= 0) return 0
        const maxOffset = nativeRange * (1 + 1 / this.verticalScale) / 2
        return Math.max(-maxOffset, Math.min(maxOffset, offset))
    }

    /**
     * 按拖拽位移缩放 Y 轴（deltaY < 0 放大，deltaY > 0 缩小）
     */
    scaleByDelta(deltaY: number): void {
        if (!Number.isFinite(deltaY) || deltaY === 0) return
        const factor = Math.exp(-deltaY * 0.01)
        const nextScale = this.verticalScale * factor
        this.verticalScale = Math.min(8, Math.max(0.2, nextScale))
        this.priceOffset = this.clampOffset(this.priceOffset)
    }

    getVerticalScale(): number {
        return this.verticalScale
    }

    /**
     * 设置刻度类型
     * 切换时会自动转换 priceOffset 以保持视口位置
     */
    setScaleType(type: ScaleType): void {
        if (type === this.scaleType) return

        const nativeMin = this.toNative(this.range.minPrice)
        const nativeMax = this.toNative(this.range.maxPrice)
        const nativeCenter = (nativeMax + nativeMin) / 2 + this.priceOffset
        const realCenter = this.fromNative(nativeCenter)

        this.scaleType = type
        if (type === 'log' && this.range.minPrice > 0) {
            this.logFormula = logFormulaForPriceRange(this.range)
        }

        const newNativeMin = this.toNative(this.range.minPrice)
        const newNativeMax = this.toNative(this.range.maxPrice)
        const newBaseCenter = (newNativeMax + newNativeMin) / 2
        this.priceOffset = this.toNative(realCenter) - newBaseCenter
        this.priceOffset = this.clampOffset(this.priceOffset)
    }

    /**
     * 获取当前刻度类型
     */
    getScaleType(): ScaleType {
        return this.scaleType
    }

    /**
     * 获取显示范围（考虑 priceOffset 和 verticalScale）
     *
     * 对数模式下：
     * - 内部计算在 log 空间进行
     * - 返回的价格为真实价格
     */
    getDisplayRange(baseRange?: PriceRange): PriceRange {
        const src = baseRange ?? this.range
        const { minPrice, maxPrice } = src

        const nativeMin = this.toNative(minPrice)
        const nativeMax = this.toNative(maxPrice)
        const nativeRange = nativeMax - nativeMin || 1
        const nativeCenter = (nativeMax + nativeMin) / 2 + this.priceOffset
        const nativeHalfRange = nativeRange / (2 * this.verticalScale)

        return {
            maxPrice: this.fromNative(nativeCenter + nativeHalfRange),
            minPrice: this.fromNative(nativeCenter - nativeHalfRange),
        }
    }

    /**
     * 价格 → Y 坐标
     * 统一使用 getDisplayRange 的结果进行映射
     */
    priceToY(price: number): number {
        const { maxPrice, minPrice } = this.getDisplayRange()
        const viewHeight = Math.max(1, this.height - this.paddingTop - this.paddingBottom)

        const nativeMin = this.toNative(minPrice)
        const nativeMax = this.toNative(maxPrice)
        const nativePrice = this.toNative(price)
        const ratio = (nativePrice - nativeMin) / (nativeMax - nativeMin || 1)

        return this.paddingTop + viewHeight * (1 - ratio)
    }

    /**
     * Y 坐标 → 价格
     * 统一使用 getDisplayRange 的结果进行映射
     */
    yToPrice(y: number): number {
        const { maxPrice, minPrice } = this.getDisplayRange()
        const viewHeight = Math.max(1, this.height - this.paddingTop - this.paddingBottom)
        const ratio = 1 - (y - this.paddingTop) / viewHeight

        const nativeMin = this.toNative(minPrice)
        const nativeMax = this.toNative(maxPrice)
        const nativePrice = nativeMin + ratio * (nativeMax - nativeMin)
        return this.fromNative(nativePrice)
    }

    /**
     * 根据像素偏移计算价格偏移
     * @param deltaY Y轴像素偏移（正数向下拖动）
     * @returns 对应的价格偏移量
     *   - 线性模式：真实价格的偏移
     *   - 对数模式：log 空间的偏移
     */
    deltaYToPriceOffset(deltaY: number): number {
        const viewHeight = Math.max(1, this.height - this.paddingTop - this.paddingBottom)
        const nativeRange = this.nativeRange() || 1
        return deltaY * (nativeRange / viewHeight)
    }
}
