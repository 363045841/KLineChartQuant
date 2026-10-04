/** 轴标签写入的唯一入口：按目标表面把 ready-to-draw 标签注册到本帧收集器。 */

import type { AxisLabel, AxisLabelSurface, RenderContext } from '@/foundation/plugin/types.js'

/**
 * 向当前帧指定表面注册一条轴标签。
 *
 * 生产者（刻度、十字线、最新价、绘图锚点）只依赖本入口，不直接操作收集器数组。
 * X 表面跨 Pane 共享，忽略 paneId；Y 表面默认落在当前 `context.pane`。
 *
 * @param context - 当前帧渲染上下文
 * @param surface - 目标轴表面
 * @param label - 待注册的 ready-to-draw 标签
 * @param paneId - Y 表面的隔离键；默认取 `context.pane.id`
 */
export function registerAxisLabel(
  context: RenderContext,
  surface: AxisLabelSurface,
  label: AxisLabel,
  paneId: string = context.pane.id,
): void {
  context.axisLabels.forSurface(surface, paneId).register(label)
}
