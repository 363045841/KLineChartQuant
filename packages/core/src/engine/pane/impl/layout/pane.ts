import type { PaneCapabilities, PaneRole } from '../../../../foundation/plugin/index.js'
import { type PriceRange, PriceScale } from '../../../scale/index.js'
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
 * Pane：代表一个"窗口区域"（主图 / 副图）。
 *
 * 一个 Pane 可以拥有多条轴；主轴沿用 `paneId` 作为轴身份，
 * 实例独立轴由框架派生后通过 `setAxes` 投影进来。
 */
export class Pane {
  readonly id: string
  readonly role: PaneRole
  readonly capabilities: PaneCapabilities
  top = 0
  height = 0

  private readonly axisScales = new Map<string, PriceScale>()
  private primaryAxisId: string
  private paddingTop = 0
  private paddingBottom = 0

  /** Pane 主轴；兼容只消费单轴的绘制与交互路径。 */
  get yAxis(): PriceScale {
    return this.axisScales.get(this.primaryAxisId)!
  }

  /** 全部轴；顺序即右侧轴列顺序。 */
  get axes(): ReadonlyArray<{ readonly axisId: string; readonly yAxis: PriceScale }> {
    return [...this.axisScales].map(([axisId, yAxis]) => ({ axisId, yAxis }))
  }

  /** 当前 pane 的有效基础价格范围。 */
  // 由 wrapPaneInfo 以结构类型 PaneInfo 暴露给插件消费，静态分析无法识别接口接收者上的访问。
  // fallow-ignore-next-line unused-class-member
  get priceRange(): PriceRange {
    return this.yAxis.getRange()
  }

  constructor(id: string, options: PaneInitOptions = {}) {
    this.id = id
    this.role = options.role ?? (id === MAIN_PANE_ID ? 'price' : 'indicator')
    this.capabilities = {
      ...defaultCapabilitiesByRole(this.role),
      ...(options.capabilities ?? {}),
    }
    this.primaryAxisId = id
    this.axisScales.set(id, new PriceScale())
  }

  /** 按轴身份取坐标映射；轴不存在时回落到主轴。 */
  axis(axisId: string): PriceScale {
    return this.axisScales.get(axisId) ?? this.yAxis
  }

  /** 应用框架派生的轴列表；保留已有轴实例，避免每帧重建范围。 */
  setAxes(axisIds: ReadonlyArray<string>): void {
    const next = new Set(axisIds.length > 0 ? axisIds : [this.id])
    for (const axisId of [...this.axisScales.keys()]) {
      if (!next.has(axisId)) this.axisScales.delete(axisId)
    }
    for (const axisId of next) {
      if (this.axisScales.has(axisId)) continue
      const scale = new PriceScale()
      scale.setHeight(this.height)
      scale.setContentInsets(this.paddingTop, this.paddingBottom)
      this.axisScales.set(axisId, scale)
    }
    this.primaryAxisId = axisIds[0] ?? this.id
  }

  /**
   * 设置 pane 的垂直布局
   * @param top 相对 plotCanvas 顶部的偏移（逻辑像素）
   * @param height pane 高度（逻辑像素）
   */
  setLayout(top: number, height: number) {
    this.top = top
    this.height = Math.max(0, height)
    for (const axis of this.axisScales.values()) axis.setHeight(this.height)
  }

  /**
   * 设置 pane 内容区的上下内缩。
   * @param top 上内缩：视觉留白
   * @param bottom 下内缩：视觉留白
   */
  setContentInsets(top: number, bottom: number) {
    this.paddingTop = top
    this.paddingBottom = bottom
    for (const axis of this.axisScales.values()) axis.setContentInsets(top, bottom)
  }
}
