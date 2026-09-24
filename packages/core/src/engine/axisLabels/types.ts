/**
 * 轴标签管理模块对外契约：单帧轴标签收集与按 Pane 隔离的帧级聚合。
 *
 * 这里只声明本模块的收集器与帧聚合形状，实现位于 axisLabels/impl/；
 * 调用方依赖本文件，不反向依赖 impl/。
 *
 * 语义约束：
 * - X 轴标签由所有 Pane 共享（时间轴全局唯一），全帧只有一份收集器；
 * - Y 轴标签按 Pane 隔离，每个 Pane 各自持有独立收集器；
 * - `labels` 是渲染器直接消费的可变缓冲区，“当前帧”语义由每帧重建保证，
 *   不持有跨帧状态。
 */

import type { AxisLabelRegistrar, XAxisLabel, YAxisLabel } from '../../foundation/plugin/types.js'

/** 单个 Pane 在当前帧的 Y 轴标签收集器（pane 隔离）。 */
export interface YAxisLabelCollector extends AxisLabelRegistrar<YAxisLabel> {
  /** 渲染器直接消费的可变标签缓冲区；`RenderContext.yAxisLabels` 即指向该数组。 */
  readonly labels: YAxisLabel[]
}

/** 所有 Pane 共享的 X 轴标签收集器（跨 Pane 时间轴）。 */
export interface XAxisLabelCollector extends AxisLabelRegistrar<XAxisLabel> {
  /** 渲染器直接消费的可变标签缓冲区；`RenderContext.xAxisLabels` 即指向该数组。 */
  readonly labels: XAxisLabel[]
}

/**
 * 单帧轴标签聚合：X 轴一份共享收集器，Y 轴按 paneId 惰性持有独立收集器。
 *
 * 每帧由渲染器新建，帧内 Pane 遍历过程中累积，帧结束后随对象一起释放。
 */
export interface AxisLabelsFrame {
  /** 共享 X 轴收集器。 */
  readonly x: XAxisLabelCollector
  /** 取指定 Pane 的 Y 轴收集器；首次访问时创建，同一 paneId 稳定返回同一实例。 */
  yForPane(paneId: string): YAxisLabelCollector
}

/** 图元投影等生产者在本帧写入 X / Y 轴标签的入口。 */
export interface AxisLabelRegistrars {
  y: Pick<AxisLabelRegistrar<YAxisLabel>, 'register'>
  x: Pick<AxisLabelRegistrar<XAxisLabel>, 'register'>
}
