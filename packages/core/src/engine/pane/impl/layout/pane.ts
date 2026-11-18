/** 窗口几何与共享对象轴资源；容器没有主副身份，也不创建默认轴。 */

import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import type { PaneCapabilities } from '../../../../foundation/plugin/index.js'
import type { AxisColumnLayout } from '../../../axisWidth/types.js'
import { type PriceRange, PriceScale } from '../../../scale/index.js'
import type { PaneAxisColumn } from '../../types.js'

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

  private axisScales = new Map<string, PriceScale>()
  /** 对象 → 轴身份；绘图等派生对象借用已有轴，不自行派生。 */
  private readonly objectAxes = new Map<string, string>()
  /** 绑定签名：只有对象归属或轴顺序变化时才重建轴资源。 */
  private axisSignature = ''
  /** 已提交的轴列布局：绘制、命中与宿主控件区共用这一份。 */
  private committedColumns: ReadonlyArray<PaneAxisColumn> = []
  private committedAxisLayout: Readonly<Record<string, AxisColumnLayout>> = {}
  private committedAxisWidth = 0
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

  /** 对象绑定的轴身份；未绑定的对象返回 null，由调用方决定是否降级。 */
  objectAxis(objectId: string): string | null {
    return this.objectAxes.get(objectId) ?? null
  }

  /** 已提交的轴列几何；列宽之和即 `axisWidth`。 */
  get axisColumns(): ReadonlyArray<PaneAxisColumn> {
    return this.committedColumns
  }

  /** 已提交的轴列布局表；按 axisId 寻址。 */
  get axisLayout(): Readonly<Record<string, AxisColumnLayout>> {
    return this.committedAxisLayout
  }

  /** 轴区宽度：各轴列宽度之和。 */
  get axisWidth(): number {
    return this.committedAxisWidth
  }

  /**
   * 应用本帧轴宽提交。
   *
   * @param columns 由 `layoutAxisColumns` 生成的列几何，列宽之和即轴区宽度
   */
  setAxisColumns(columns: ReadonlyArray<PaneAxisColumn>): void {
    this.committedColumns = columns
    this.committedAxisLayout = Object.fromEntries(
      columns.map((column) => [column.axisId, { left: column.left, width: column.width }]),
    )
    this.committedAxisWidth = columns.reduce((total, column) => total + column.width, 0)
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

  /**
   * 应用窗格轴及其数据对象绑定。
   *
   * 保留已有轴实例及其范围，按声明顺序排列轴列。
   *
   * @param axes 窗格轴及其绑定对象
   * @returns 轴列表或对象绑定是否变化
   */
  setAxes(
    axes: ReadonlyArray<{ readonly objectIds: readonly string[]; readonly axisId: string }>,
  ): boolean {
    const signature = JSON.stringify(axes.map(({ axisId, objectIds }) => [axisId, objectIds]))
    if (signature === this.axisSignature) return false
    const scales = new Map<string, PriceScale>()
    const objectAxes = new Map<string, string>()
    for (const { axisId, objectIds } of axes) {
      let scale = this.axisScales.get(axisId)
      if (scale === undefined) {
        scale = new PriceScale()
        scale.setHeight(this.height)
        scale.setContentInsets(this.paddingTop, this.paddingBottom)
      }
      scales.set(axisId, scale)
      for (const objectId of objectIds) objectAxes.set(objectId, axisId)
    }
    this.axisSignature = signature
    this.axisScales = scales
    this.objectAxes.clear()
    for (const [objectId, axisId] of objectAxes) this.objectAxes.set(objectId, axisId)
    return true
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
