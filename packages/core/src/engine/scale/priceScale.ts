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

    /**
     * 根据当前 range 和 verticalScale 对 priceOffset 进行 clamp，
     * 防止视口完全离开数据范围。
     */
    private clampOffset(offset: number): number {
        if (this.scaleType === 'log' && this.range.minPrice > 0) {
            const logMin = toLog(this.range.minPrice, this.logFormula)
            const logMax = toLog(this.range.maxPrice, this.logFormula)
            const logRange = logMax - logMin
            if (logRange <= 0) return 0
            const maxOffset = logRange * (1 + 1 / this.verticalScale) / 2
            return Math.max(-maxOffset, Math.min(maxOffset, offset))
        }

        if (this.scaleType === 'percent' && this.basePrice !== null && this.basePrice > 0) {
            const pctMin = this.toPercent(this.range.minPrice)
            const pctMax = this.toPercent(this.range.maxPrice)
            const pctRange = pctMax - pctMin
            if (pctRange <= 0) return 0
            const maxOffset = pctRange * (1 + 1 / this.verticalScale) / 2
            return Math.max(-maxOffset, Math.min(maxOffset, offset))
        }

        const rangeSize = this.range.maxPrice - this.range.minPrice
        if (rangeSize <= 0) return 0
        const maxOffset = rangeSize * (1 + 1 / this.verticalScale) / 2
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

        const baseCenter = (this.range.maxPrice + this.range.minPrice) / 2

        if (type === 'log' && this.range.minPrice > 0) {
            // 当前 linear/percent → 对数：转换 priceOffset 到 log 空间
            this.logFormula = logFormulaForPriceRange(this.range)

            // 先把当前偏移转为真实价格中心
            let realCenter: number
            if (this.scaleType === 'percent' && this.basePrice !== null && this.basePrice > 0) {
                const pctBaseCenter = this.toPercent(baseCenter)
                const pctCenter = pctBaseCenter + this.priceOffset
                realCenter = this.fromPercent(pctCenter)
            } else {
                realCenter = baseCenter + this.priceOffset
            }

            this.priceOffset = toLog(realCenter, this.logFormula) - toLog(baseCenter, this.logFormula)
            this.priceOffset = this.clampOffset(this.priceOffset)
        } else if (type === 'linear') {
            if (this.scaleType === 'log') {
                // 对数 → 线性
                const logMin = toLog(this.range.minPrice, this.logFormula)
                const logMax = toLog(this.range.maxPrice, this.logFormula)
                const logCenter = (logMax + logMin) / 2 + this.priceOffset
                const realCenter = fromLog(logCenter, this.logFormula)
                this.priceOffset = realCenter - baseCenter
            } else if (this.scaleType === 'percent' && this.basePrice !== null && this.basePrice > 0) {
                // 百分比 → 线性
                const pctBaseCenter = this.toPercent(baseCenter)
                const pctCenter = pctBaseCenter + this.priceOffset
                const realCenter = this.fromPercent(pctCenter)
                this.priceOffset = realCenter - baseCenter
            }
            this.priceOffset = this.clampOffset(this.priceOffset)
        } else if (type === 'percent' && this.basePrice !== null && this.basePrice > 0) {
            // linear/log → 百分比
            // 先把当前偏移转为真实价格中心
            let realCenter: number
            if (this.scaleType === 'log') {
                const logMin = toLog(this.range.minPrice, this.logFormula)
                const logMax = toLog(this.range.maxPrice, this.logFormula)
                const logCenter = (logMax + logMin) / 2 + this.priceOffset
                realCenter = fromLog(logCenter, this.logFormula)
            } else {
                realCenter = baseCenter + this.priceOffset
            }

            const pctBaseCenter = this.toPercent(baseCenter)
            const pctCenter = this.toPercent(realCenter)
            this.priceOffset = pctCenter - pctBaseCenter
            this.priceOffset = this.clampOffset(this.priceOffset)
        }

        this.scaleType = type
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

        // 对数模式：在 log 空间计算
        if (this.scaleType === 'log' && minPrice > 0) {
            const logMin = toLog(minPrice, this.logFormula)
            const logMax = toLog(maxPrice, this.logFormula)
            const logRange = logMax - logMin || 1
            const logCenter = (logMax + logMin) / 2 + this.priceOffset
            const logHalfRange = logRange / (2 * this.verticalScale)
            return {
                maxPrice: fromLog(logCenter + logHalfRange, this.logFormula),
                minPrice: fromLog(logCenter - logHalfRange, this.logFormula),
            }
        }

        // 百分比模式：在百分比空间计算，返回真实价格
        if (this.scaleType === 'percent' && this.basePrice !== null && this.basePrice > 0) {
            const pctMin = this.toPercent(minPrice)
            const pctMax = this.toPercent(maxPrice)
            const pctRange = pctMax - pctMin || 1
            const pctCenter = (pctMax + pctMin) / 2 + this.priceOffset
            const pctHalfRange = pctRange / (2 * this.verticalScale)
            return {
                maxPrice: this.fromPercent(pctCenter + pctHalfRange),
                minPrice: this.fromPercent(pctCenter - pctHalfRange),
            }
        }

        // 线性模式：原逻辑不变
        const baseRangeSize = maxPrice - minPrice || 1
        const centerPrice = (maxPrice + minPrice) / 2 + this.priceOffset
        const halfRange = baseRangeSize / (2 * this.verticalScale)
        return {
            maxPrice: centerPrice + halfRange,
            minPrice: centerPrice - halfRange,
        }
    }

    /**
     * 价格 → Y 坐标
     * 统一使用 getDisplayRange 的结果进行映射
     */
    priceToY(price: number): number {
        const { maxPrice, minPrice } = this.getDisplayRange()
        const viewHeight = Math.max(1, this.height - this.paddingTop - this.paddingBottom)

        let ratio: number
        if (this.scaleType === 'log' && minPrice > 0) {
            const logMin = toLog(minPrice, this.logFormula)
            const logMax = toLog(maxPrice, this.logFormula)
            const logPrice = toLog(price, this.logFormula)
            ratio = (logPrice - logMin) / (logMax - logMin || 1)
        } else if (this.scaleType === 'percent' && this.basePrice !== null && this.basePrice > 0) {
            const pctMin = this.toPercent(minPrice)
            const pctMax = this.toPercent(maxPrice)
            const pctPrice = this.toPercent(price)
            ratio = (pctPrice - pctMin) / (pctMax - pctMin || 1)
        } else {
            ratio = (price - minPrice) / (maxPrice - minPrice || 1)
        }

        // 注意：ratio = 0 对应 minPrice（底部），ratio = 1 对应 maxPrice（顶部）
        // 但在屏幕上，y=0 是顶部，y=height 是底部
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

        if (this.scaleType === 'log' && minPrice > 0) {
            const logMin = toLog(minPrice, this.logFormula)
            const logMax = toLog(maxPrice, this.logFormula)
            const logPrice = logMin + ratio * (logMax - logMin)
            return fromLog(logPrice, this.logFormula)
        }

        if (this.scaleType === 'percent' && this.basePrice !== null && this.basePrice > 0) {
            const pctMin = this.toPercent(minPrice)
            const pctMax = this.toPercent(maxPrice)
            const pctPrice = pctMin + ratio * (pctMax - pctMin)
            return this.fromPercent(pctPrice)
        }

        return minPrice + ratio * (maxPrice - minPrice)
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

        if (this.scaleType === 'log' && this.range.minPrice > 0) {
            const logMin = toLog(this.range.minPrice, this.logFormula)
            const logMax = toLog(this.range.maxPrice, this.logFormula)
            return deltaY * ((logMax - logMin) / viewHeight)
        }

        if (this.scaleType === 'percent' && this.basePrice !== null && this.basePrice > 0) {
            const { maxPrice, minPrice } = this.getDisplayRange()
            const pctMin = this.toPercent(minPrice)
            const pctMax = this.toPercent(maxPrice)
            return deltaY * ((pctMax - pctMin) / viewHeight)
        }

        const range = this.range.maxPrice - this.range.minPrice || 1
        return deltaY * (range / viewHeight)
    }
}
