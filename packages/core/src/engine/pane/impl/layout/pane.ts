/** 窗口几何与独立对象轴资源；容器没有主副身份，也不创建默认轴。 */

import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import type { PaneCapabilities } from '../../../../foundation/plugin/index.js'
import { type PriceRange, PriceScale } from '../../../scale/index.js'

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
  capabilities?: Partial<PaneCapabilities>
}

function defaultCapabilities(): PaneCapabilities {
  return {
    supportsPriceTranslate: true,
  }
}

/**
 * Pane：代表一个窗口区域。
 *
 * 所有轴均由对象声明，经统一轴 API 投影，不从 Pane 身份推断。
 */
export class Pane {
  readonly id: string
  readonly capabilities: PaneCapabilities
  top = 0
  height = 0

  private readonly axisScales = new Map<string, PriceScale>()
  private paddingTop = 0
  private paddingBottom = 0

  /** 单轴容器的便捷查询；多轴必须显式提供 axisId。 */
  get yAxis(): PriceScale {
    if (this.axisScales.size !== 1)
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_STATE,
        `Pane ${this.id} 有 ${this.axisScales.size} 条轴，必须指定 axisId`,
      )
    return this.axisScales.values().next().value!
  }

  /** 空容器没有隐式轴；交互只在已有坐标对象的区域解析数值。 */
  get hasAxes(): boolean {
    return this.axisScales.size > 0
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
    this.capabilities = {
      ...defaultCapabilities(),
      ...(options.capabilities ?? {}),
    }
  }

  /** 按明确身份取轴；不存在时抛异常，不能替换为其他对象的轴。 */
  axis(axisId: string): PriceScale {
    const axis = this.axisScales.get(axisId)
    if (!axis)
      throw new KLineChartError(
        GENERIC_ERROR_CODES.NOT_REGISTERED,
        `Pane ${this.id} 中不存在轴 ${axisId}`,
      )
    return axis
  }

  /** 应用框架派生的轴列表；保留已有轴实例，避免每帧重建范围。 */
  setAxes(axisIds: ReadonlyArray<string>): void {
    const next = new Set(axisIds)
    if (next.size !== axisIds.length)
      throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, `Pane ${this.id} 的轴身份重复`)
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
