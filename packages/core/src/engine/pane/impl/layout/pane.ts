import type { PaneCapabilities, PaneRole } from '../../../../foundation/plugin/index.js'
import type { KLineData } from '../../../../foundation/types/price.js'
import { type PriceRange, PriceScale } from '../../../scale/index.js'
import { getVisiblePriceRange, type VisibleRange } from '../../../viewport/viewport.js'
import { MAIN_PANE_ID } from '../../types.js'

/**
 * 更新级别枚举 - 用于双层 Canvas 架构
 * Main: 只更新主画布（K线、指标等静态内容）
 * Overlay: 只更新覆盖层（十字线、Tooltip等动态内容）
 * All: 更新所有层
 */
export enum UpdateLevel {
  Main = 'main',
  Overlay = 'overlay',
  All = 'all',
}

export interface PaneInitOptions {
  role?: PaneRole
  capabilities?: Partial<PaneCapabilities>
}

function defaultCapabilitiesByRole(role: PaneRole): PaneCapabilities {
  if (role === 'price') {
    return {
      showPriceAxisTicks: true,
      showCrosshairPriceLabel: true,
      candleHitTest: true,
      supportsPriceTranslate: true,
    }
  }
  if (role === 'indicator') {
    return {
      showPriceAxisTicks: false,
      showCrosshairPriceLabel: true,
      candleHitTest: false,
      supportsPriceTranslate: true,
    }
  }
  return {
    showPriceAxisTicks: false,
    showCrosshairPriceLabel: false,
    candleHitTest: false,
    supportsPriceTranslate: false,
  }
}

/**
 * Pane：代表一个"窗口区域"（主图 / 副图）
 */
export class Pane {
  readonly id: string
  readonly role: PaneRole
  readonly capabilities: PaneCapabilities
  top = 0
  height = 0

  /** pane 独立 Y 轴 */
  readonly yAxis = new PriceScale()

  /** 当前 pane 的有效基础价格范围。 */
  get priceRange(): PriceRange {
    return this.yAxis.getRange()
  }

  /**
   * 创建 pane 实例
   * @param id pane 标识符（例如 'main'、'sub'），用于在 Chart/Interaction 中识别 pane
   */
  constructor(id: string, options: PaneInitOptions = {}) {
    this.id = id
    this.role = options.role ?? (id === MAIN_PANE_ID ? 'price' : 'indicator')
    this.capabilities = {
      ...defaultCapabilitiesByRole(this.role),
      ...(options.capabilities ?? {}),
    }
  }

  /**
   * 设置 pane 的垂直布局
   * @param top 相对 plotCanvas 顶部的偏移（逻辑像素）
   * @param height pane 高度（逻辑像素）
   */
  setLayout(top: number, height: number) {
    this.top = top
    this.height = Math.max(1, height)
    this.yAxis.setHeight(this.height)
  }

  /**
   * 设置 Y 轴上下 padding
   * @param top 上内边距，影响 priceToY 映射的顶部留白
   * @param bottom 下内边距，影响 priceToY 映射的底部留白
   */
  setPadding(top: number, bottom: number) {
    this.yAxis.setPadding(top, bottom)
  }

  /**
   * 根据当前可见索引区间更新 priceRange 并同步到 yAxis
   * @param data 全量 K 线数据
   * @param range 当前视口可见的索引范围（由 getVisibleRange 计算）
   * @param indicatorRange 可选的指标极值范围，与K线极值合并
   */
  updateRange(
    data: KLineData[],
    range: VisibleRange,
    indicatorRange?: { min: number; max: number } | null,
  ) {
    // 纯未来区视口：可见区间无任何真实 bar，冻结最近一次有效价格区间与基准价（TV 行为），
    // 避免跳变到 {100,0} 兜底；冷启动即未来区（data 为空）仍走原兜底
    const hasVisibleBar = range.start < data.length && range.end > Math.max(0, range.start)
    if (!hasVisibleBar && data.length > 0) return

    const priceRange = getVisiblePriceRange(data, range.start, range.end)

    // 如果有指标极值，合并到价格范围
    if (
      indicatorRange &&
      Number.isFinite(indicatorRange.min) &&
      Number.isFinite(indicatorRange.max)
    ) {
      priceRange.minPrice = Math.min(priceRange.minPrice, indicatorRange.min)
      priceRange.maxPrice = Math.max(priceRange.maxPrice, indicatorRange.max)
    }

    this.yAxis.setRange(priceRange)

    // 百分比轴（左/右）需要基准价；始终为 price pane 设置，由 leftYAxis/yAxis 按需调用 toPercent
    if (this.role === 'price' && data.length > 0 && range.start < data.length) {
      const baseIdx = Math.max(0, range.start)
      this.yAxis.setBasePrice(data[baseIdx]?.close ?? null)
    } else {
      this.yAxis.setBasePrice(null)
    }
  }
}
