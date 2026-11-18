/**
 * 右轴列几何：把逐轴宽度展开成列，并吸收已提交宽度的下限差额。
 *
 * 列几何是绘制、命中与宿主控件区的唯一来源，因此列宽之和必须恒等于本 Pane
 * 已提交的轴区宽度；差额并入主轴列（离数据最近的一列）。
 */
import type { PaneAxisColumn } from '../../pane/types.js'

/**
 * 生成右轴列几何。
 *
 * @param axisIds 轴列顺序
 * @param widthByAxis 逐轴标签宽度
 * @param committedWidth 本 Pane 已提交的轴区总宽
 * @returns 列几何；`left` 从左到右累计
 */
export function layoutAxisColumns(
  axisIds: ReadonlyArray<string>,
  widthByAxis: Readonly<Record<string, number>>,
  committedWidth: number,
): PaneAxisColumn[] {
  const widths = axisIds.map((axisId) => widthByAxis[axisId] ?? 0)
  const total = widths.reduce((sum, width) => sum + width, 0)
  const deficit = Math.max(0, committedWidth - total)
  let left = 0
  return axisIds.map((axisId, index) => {
    const width = widths[index]! + (index === 0 ? deficit : 0)
    const column: PaneAxisColumn = { axisId, left, width }
    left += width
    return column
  })
}
