/** 区间选框只消费已提交帧的坐标投影，不再独立推导 K 线网格。 */
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import { findNearestKLineIndex } from './getKLineIndexByTimestamp.js'

export interface Bounds {
  start: number
  end: number
}

/** 从时间边界定位本帧数据，再复用实体中心和物理宽度求内容坐标。 */
export function calcRangeOverlayPixel(
  selection: ReturnType<ChartController['rangeSelection']['peek']>,
  frame: NonNullable<ReturnType<ChartController['frameGeometry']['peek']>>,
): { left: number; width: number; height: number } | null {
  const { startTimestamp, endTimestamp } = selection
  if (startTimestamp === null || endTimestamp === null) return null
  const start = findNearestKLineIndex(frame.data, startTimestamp, 'left')
  const end = findNearestKLineIndex(frame.data, endTimestamp, 'right')
  if (start === null || end === null) return null

  const { viewSnapshot: view, viewport } = frame
  const first = view.worldAtIndex(Math.min(start, end))
  const last = view.worldAtIndex(Math.max(start, end))
  if (first === null || last === null) return null
  const half = (view.kWidthPx - 1) / (2 * viewport.dpr)
  const left = view.domOffset + first - half
  const right = view.domOffset + last - half + view.kWidthPx / viewport.dpr
  return { left, width: right - left, height: viewport.plotHeight }
}
