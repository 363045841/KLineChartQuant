import type { KLineData } from '../../types/price'
import { getVisiblePriceRange } from '../viewport/viewport'
import type { PriceRange } from '../scale/price'
import { PriceScale } from '../scale/priceScale'
import type { MarkerManager } from '../marker/registry'
import type { PaneCapabilities, PaneRole } from '../../plugin'

/**
 * 更新级别枚举 - 用于双层 Canvas 架构
 * Main: 只更新主画布（K线、指标等静态内容）
 * Overlay: 只更新覆盖层（十字线、Tooltip等动态内容）
 * All: 更新所有层
 */
export enum UpdateLevel {
  Main = 'main',
  Overlay = 'overlay',
  All = 'all'
}

export type VisibleRange = { start: number; end: number }

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
 * Pane 级渲染器接口：在单个 pane 的坐标系中绘制内容
 */
export interface PaneRenderer {
  /**
   * 在指定 pane 坐标系中绘制内容
   * @param ctx Canvas 绘图上下文，Chart 已执行 translate(0, pane.top)，y=0 对应 pane 顶部
   * @param pane 当前 pane 实例
   * @param data 全量 K 线数据
   * @param range 当前视口可见的索引范围
   * @param scrollLeft 滚动偏移量，renderer 内部如需 world 坐标需执行 ctx.translate(-scrollLeft, 0)
   * @param kWidth K 线宽度
   * @param kGap K 线间隔
   * @param dpr 设备像素比
   * @param paneWidth pane 宽度
   * @param kLinePositions 可选，K 线起始 x 坐标数组（由 Chart 统一计算）
   */
  draw(args: {
    ctx: CanvasRenderingContext2D
    pane: Pane
    data: KLineData[]
    range: VisibleRange
    scrollLeft: number
    kWidth: number
    kGap: number
    dpr: number
    paneWidth: number
    kLinePositions: number[]
    markerManager?: MarkerManager
  }): void
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

  /** 当前 pane 的可视价格范围（用于右侧轴、以及渲染器内部） */
  priceRange: PriceRange = { maxPrice: 100, minPrice: 0 }

  /** pane 独立 Y 轴 */
  readonly yAxis = new PriceScale()

  /** 该 pane 的渲染器列表 */
  readonly renderers: PaneRenderer[] = []

  /**
   * 创建 pane 实例
   * @param id pane 标识符（例如 'main'、'sub'），用于在 Chart/Interaction 中识别 pane
   */
  constructor(id: string, options: PaneInitOptions = {}) {
    this.id = id
    this.role = options.role ?? (id === 'main' ? 'price' : 'indicator')
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
   * 注册一个 pane 级渲染器
   * @param renderer pane 级渲染器实例
   */
  addRenderer(renderer: PaneRenderer) {
    this.renderers.push(renderer)
  }

  /**
   * 根据当前可见索引区间更新 priceRange 并同步到 yAxis
   * @param data 全量 K 线数据
   * @param range 当前视口可见的索引范围（由 getVisibleRange 计算）
   * @param indicatorRange 可选的指标极值范围，与K线极值合并
   */
  updateRange(data: KLineData[], range: VisibleRange, indicatorRange?: { min: number; max: number } | null) {
    this.priceRange = getVisiblePriceRange(data, range.start, range.end)

    // 如果有指标极值，合并到价格范围
    if (indicatorRange && Number.isFinite(indicatorRange.min) && Number.isFinite(indicatorRange.max)) {
      this.priceRange.minPrice = Math.min(this.priceRange.minPrice, indicatorRange.min)
      this.priceRange.maxPrice = Math.max(this.priceRange.maxPrice, indicatorRange.max)
    }

    this.yAxis.setRange(this.priceRange)

    // 百分比模式：设置基准价为 visibleRange 第一根 K 线的收盘价
    if (this.yAxis.getScaleType() === 'percent' && this.role === 'price' && data.length > 0 && range.start < data.length) {
      const baseIdx = Math.max(0, range.start)
      this.yAxis.setBasePrice(data[baseIdx]?.close ?? null)
    } else {
      this.yAxis.setBasePrice(null)
    }
  }
}
