// Pane 价格坐标映射：把价格范围投影到 pane 内 Y 坐标，并提供纯平移/缩放的 range 计算。
import { ScaleType } from '../../../../foundation/types/scaleType.js'

import { fromLog, type LogFormula, logFormulaForPriceRange, toLog } from './logFormula.js'
import type { PriceRange } from './price.js'

/**
 * Pane 级别的价格坐标系（价格 -> pane 内 Y）
 * - y=0 在 pane 顶部，y=height 在 pane 底部
 * - range 是唯一几何来源：显示哪段价格由它决定，不再持有独立的平移/缩放状态
 */
export class PriceScale {
  private range: PriceRange = { maxPrice: 100, minPrice: 0 }
  private height = 1
  private paddingTop = 0
  private paddingBottom = 0

  /** 刻度类型：线性 / 对数 / 百分比 */
  private scaleType: ScaleType = ScaleType.Linear

  /** 对数变换公式（随范围刷新，适配极小价格） */
  private logFormula: LogFormula = logFormulaForPriceRange(null)

  /** 百分比轴基准价（可见区首根 close / 分时昨收） */
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

  /** 获取当前范围的百分比范围（用于 yAxis 刻度显示） */
  getDisplayPercentRange(): { minPct: number; maxPct: number } {
    const { maxPrice, minPrice } = this.getDisplayRange()
    return {
      minPct: this.toPercent(minPrice),
      maxPct: this.toPercent(maxPrice),
    }
  }

  private isPercent(): boolean {
    return this.scaleType === ScaleType.Percent && this.basePrice !== null && this.basePrice > 0
  }

  private isLog(): boolean {
    return this.scaleType === ScaleType.Log && this.range.minPrice > 0
  }

  /** 价格 → 刻度原生空间（对数换底、百分比换百分比、线性直通）。 */
  private toNative(price: number): number {
    if (this.isLog()) return toLog(price, this.logFormula)
    if (this.isPercent()) return this.toPercent(price)
    return price
  }

  /** 刻度原生空间 → 价格。 */
  private fromNative(n: number): number {
    if (this.isLog()) return fromLog(n, this.logFormula)
    if (this.isPercent()) return this.fromPercent(n)
    return n
  }

  /** 设置显示价格范围；对数轴同步刷新 log 变换公式。 */
  setRange(range: PriceRange): void {
    this.range = range
    if (this.scaleType === ScaleType.Log && range.minPrice > 0) {
      this.logFormula = logFormulaForPriceRange(range)
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

  /** 设置刻度类型；对数轴按当前范围刷新变换公式，不改变范围本身。 */
  setScaleType(type: ScaleType): void {
    if (type === this.scaleType) return
    this.scaleType = type
    if (type === ScaleType.Log && this.range.minPrice > 0) {
      this.logFormula = logFormulaForPriceRange(this.range)
    }
  }

  /** 获取当前刻度类型 */
  getScaleType(): ScaleType {
    return this.scaleType
  }

  /** 显示范围：运行时轴只投影内核决定的范围，不做二次变换。 */
  getDisplayRange(baseRange?: PriceRange): PriceRange {
    return baseRange ?? this.range
  }

  /** pane 内容区的有效高度（扣除上下 padding）。 */
  private viewHeight(): number {
    return Math.max(1, this.height - this.paddingTop - this.paddingBottom)
  }

  /**
   * 把 baseRange 竖直平移指定像素，返回平移后的范围；不修改自身状态。
   * @param baseRange 起始范围
   * @param deltaY 像素位移（正数向下）
   */
  translateRange(baseRange: PriceRange, deltaY: number): PriceRange {
    const min = this.toNative(baseRange.minPrice)
    const max = this.toNative(baseRange.maxPrice)
    const shift = deltaY * ((max - min || 1) / this.viewHeight())
    return { minPrice: this.fromNative(min + shift), maxPrice: this.fromNative(max + shift) }
  }

  /**
   * 围绕 anchorY 缩放 baseRange，返回缩放后的范围；不修改自身状态。
   * @param baseRange 起始范围
   * @param deltaY 像素位移（向上放大 span 收窄、向下缩小）
   * @param anchorY pane 内锚点像素；省略时按中心缩放
   */
  scaleRange(baseRange: PriceRange, deltaY: number, anchorY?: number): PriceRange {
    if (!Number.isFinite(deltaY) || deltaY === 0) return baseRange
    const min = this.toNative(baseRange.minPrice)
    const max = this.toNative(baseRange.maxPrice)
    const factor = Math.exp(-deltaY * 0.01)
    const half = (max - min) / (2 * factor)
    const fractionFromTop =
      anchorY === undefined || !Number.isFinite(anchorY)
        ? 0.5
        : (anchorY - this.paddingTop) / this.viewHeight()
    // 固定 anchorY 处的价格，围绕它收放原生跨度。
    const anchorValue = max - fractionFromTop * (max - min)
    const center = anchorValue + (2 * fractionFromTop - 1) * half
    return { minPrice: this.fromNative(center - half), maxPrice: this.fromNative(center + half) }
  }

  /**
   * 价格 → Y 坐标
   */
  priceToY(price: number): number {
    const { maxPrice, minPrice } = this.getDisplayRange()
    const viewHeight = this.viewHeight()

    const nativeMin = this.toNative(minPrice)
    const nativeMax = this.toNative(maxPrice)
    const nativePrice = this.toNative(price)
    const ratio = (nativePrice - nativeMin) / (nativeMax - nativeMin || 1)

    return this.paddingTop + viewHeight * (1 - ratio)
  }

  /**
   * Y 坐标 → 价格
   */
  yToPrice(y: number): number {
    const { maxPrice, minPrice } = this.getDisplayRange()
    const viewHeight = this.viewHeight()
    const ratio = 1 - (y - this.paddingTop) / viewHeight

    const nativeMin = this.toNative(minPrice)
    const nativeMax = this.toNative(maxPrice)
    const nativePrice = nativeMin + ratio * (nativeMax - nativeMin)
    return this.fromNative(nativePrice)
  }
}
