/** 轴宽估算：把本帧各轴的标签宽度需求换算成列宽，不做跨帧缓存。 */

import type { AxisWidthFrame, AxisWidths } from '../types.js'

/**
 * 解析单侧轴宽：已提交宽度只能被更宽的需求推开，不会自行收缩。
 *
 * 轴宽是布局属性，缩放、平移、悬停期间保持稳定；否则绘图区宽度会在运动途中
 * 改变，坐标轴与绘图区右缘跟着跳动。只有布局变化后传入 committed=null 才重新评估。
 *
 * @param floor 轴宽下限
 * @param requested 本帧标签需要的宽度
 * @param committed 已提交宽度；null 表示重新评估
 */
export function resolveAxisWidth(
  floor: number,
  requested: number,
  committed: number | null,
): number {
  return Math.max(floor, requested, committed ?? 0)
}

/**
 * 输入本帧各轴的标签宽度需求，返回左右两侧所需宽度与逐列宽度。
 *
 * 标签每帧全量收集，因此这里也不需要跨帧缓存；宽度稳定性由调用方的
 * `resolveAxisWidth` 提交规则保证。
 *
 * @param frame 本帧轴宽度需求
 */
export function estimateAxisWidths(frame: AxisWidthFrame): AxisWidths {
  const result: AxisWidths = { left: 0, right: 0, rightByAxis: {} }
  const rightByAxis: Record<string, number> = {}
  const rightByPane = new Map<string, number>()
  for (const axis of frame.axes) {
    result.left = Math.max(result.left, axis.leftWidth)
    const right = Math.max(axis.staticWidth, axis.overlayWidth)
    rightByAxis[axis.axisId] = right
    rightByPane.set(axis.paneId, (rightByPane.get(axis.paneId) ?? 0) + right)
  }
  // 窗格垂直排列，右侧只需要容纳最宽的一个窗格，不能跨窗格累加。
  result.right = Math.max(0, ...rightByPane.values())
  return { ...result, rightByAxis }
}
