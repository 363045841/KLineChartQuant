/**
 * 帧级时间轴刻度投影：可见槽位范围 + 槽位网格 → 共享刻度。
 *
 * 时间轴与网格线消费同一份刻度，落点由各自已有的坐标/中心点换算，不再各自扫描槽位。
 */

import type { SlotGrid } from '@/foundation/geometry/slotGrid.js'
import {
  createSeriesTimeProjection,
  frameTimeTicks,
  resolveTimeTickTarget,
  resolveTimeTickUnit,
  type TimeTick,
} from '@/foundation/time/index.js'
import { isTimeSharePeriod } from '@/foundation/types/chartPeriod.js'

/** 时间轴文字与绘图区边界的留白（逻辑像素）；刻度范围与标签过滤共用它。 */
export const TIME_AXIS_PADDING = 8

/** 刻度投影输入：全部来自同一帧快照。 */
export interface FrameTimeTicksInput {
  readonly data: ReadonlyArray<{ timestamp: number }>
  readonly grid: SlotGrid
  readonly scrollLeft: number
  readonly plotWidth: number
  readonly period: string | undefined
  readonly timeZone: string
}

/**
 * 投影本帧时间轴刻度。
 *
 * @param input 本帧数据、槽位网格、滚动、绘图宽度与显示时区
 * @returns 按槽位升序的刻度；分时视图或没有常规槽距时为空
 */
export function projectFrameTimeTicks(input: FrameTimeTicksInput): readonly TimeTick[] {
  const { grid, scrollLeft, plotWidth } = input
  if (isTimeSharePeriod(input.period) || !(grid.step > 0)) return []
  return frameTimeTicks({
    projection: createSeriesTimeProjection(input.data),
    firstIndex: Math.floor((scrollLeft + TIME_AXIS_PADDING - grid.origin) / grid.step),
    lastIndex: Math.ceil((scrollLeft + plotWidth - TIME_AXIS_PADDING - grid.origin) / grid.step),
    unit: resolveTimeTickUnit(input.period),
    target: resolveTimeTickTarget(plotWidth),
    timeZone: input.timeZone,
  })
}
