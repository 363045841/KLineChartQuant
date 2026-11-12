/**
 * 单帧坐标服务：时间是唯一事实，逻辑槽位与像素都是当前帧的投影。
 *
 * 时间换算委托给 Foundation 的序列时间投影，像素换算只在这里；数据两端的留白
 * 与真实行情因此共用同一套外推规则。
 */

import { logicalIndexToScreenX } from '@/engine/viewport/logicalIndexToScreenX.js'
import { createKLineSlotGrid, slotWorldX } from '@/engine/viewport/slotGrid.js'
import type { FrameCoordinates } from '@/foundation/geometry/frameCoordinates.js'
import { createSeriesTimeProjection } from '@/foundation/time/index.js'
import { type ChartDataView, ChartDataViewId } from '@/foundation/types/chartView.js'
import { worldXToScreenX } from '@/foundation/utils/pixelAlign.js'

/** 构造帧坐标所需的快照；所有字段都来自同一帧，不持有可变引用。 */
export interface FrameCoordinateInput {
  readonly data: ReadonlyArray<{ timestamp: number }>
  readonly range: { readonly start: number; readonly end: number }
  readonly kLineCenters: ReadonlyArray<number>
  readonly scrollLeft: number
  readonly dpr: number
  readonly kWidth: number
  readonly kGap: number
  readonly dataView: ChartDataView
  readonly priceAxis: {
    priceToY(price: number): number
    yToPrice(y: number): number
  }
}

/** 有限的坐标值才可以离开坐标边界。 */
function finite(value: number): number | null {
  return Number.isFinite(value) ? value : null
}

/** 连续位置取最近整数槽位；取整只影响显示位置，不改变时间。 */
function nearestSlot(value: number | null): number | null {
  return value === null ? null : Math.round(value)
}

/**
 * 用一帧快照构造坐标服务。
 *
 * @param input 本帧数据、可见范围、槽位中心、滚动与 Pane 价格轴
 * @returns 只读坐标服务；同一帧的绘图、命中与时间轴共用同一个实例
 */
export function createFrameCoordinates(input: FrameCoordinateInput): FrameCoordinates {
  const { data, range, kLineCenters, scrollLeft, dpr, kWidth, kGap, dataView, priceAxis } = input
  const time = createSeriesTimeProjection(data)
  const grid =
    dataView === ChartDataViewId.KLine ? createKLineSlotGrid(kWidth, kGap, dpr) : undefined

  /** 时间 → 连续槽位；与刻度枚举共用同一份插值和外推。 */
  function timeToLogical(timestamp: number): number | null {
    return time.timeToLogical(timestamp)
  }

  /** 连续槽位 → 时间；与刻度枚举共用同一份插值和外推。 */
  function logicalToTime(index: number): number | null {
    return time.logicalToTime(index)
  }

  /** 整数槽位的时间；未来槽位按常规槽距推算，真实行情覆盖后同一时间自动落到真实槽位。 */
  function slotToTime(index: number): number | null {
    return Number.isInteger(index) ? logicalToTime(index) : null
  }

  /** 使用封存的中心点和像素网格，所有图元共享同一投影。 */
  function logicalToX(index: number): number | null {
    if (!Number.isFinite(index)) return null
    // 纯留白视口没有已绘制的中心点，槽位网格本身仍是唯一横轴依据。
    if (kLineCenters.length === 0)
      return grid === undefined
        ? null
        : finite(worldXToScreenX(slotWorldX(grid, index), scrollLeft, dpr))
    return logicalIndexToScreenX({
      index,
      visibleRange: range,
      centers: kLineCenters,
      scrollLeft,
      dpr,
      fallbackStep: kWidth + kGap,
      grid,
    })
  }

  /** 视口外的槽位按同一条网格或边缘中心步长反算，与投影互为逆运算。 */
  function extrapolateLogical(x: number, fromRight: boolean): number | null {
    if (grid) return finite((x + scrollLeft - grid.origin) / grid.step)
    const edgeIndex = fromRight ? range.start + kLineCenters.length - 1 : range.start
    const edgeX = logicalToX(edgeIndex)
    const edgeCenter = fromRight ? kLineCenters[kLineCenters.length - 1] : kLineCenters[0]
    const neighbor = fromRight ? kLineCenters[kLineCenters.length - 2] : kLineCenters[1]
    if (edgeX === null || edgeCenter === undefined) return null
    const step = neighbor === undefined ? kWidth + kGap : Math.abs(edgeCenter - neighbor)
    return step > 0 ? finite(edgeIndex + (x - edgeX) / step) : null
  }

  /** 实际显示的相邻中心之间反算，保留大周期内的分数位置。 */
  function xToLogical(x: number): number | null {
    if (!Number.isFinite(x)) return null
    if (kLineCenters.length === 0)
      return grid === undefined ? null : finite((x + scrollLeft - grid.origin) / grid.step)
    const start = range.start
    const end = start + kLineCenters.length - 1
    const startX = logicalToX(start)
    const endX = logicalToX(end)
    if (startX === null || endX === null) return null
    const left = Math.min(startX, endX)
    const right = Math.max(startX, endX)
    if (x < left) return extrapolateLogical(x, false)
    if (x > right) return extrapolateLogical(x, true)
    let low = start
    let high = end
    while (low <= high) {
      const middle = (low + high) >> 1
      const center = logicalToX(middle)
      if (center === null) return null
      if (center === x) return middle
      if (center < x) low = middle + 1
      else high = middle - 1
    }
    const lower = low - 1
    const first = logicalToX(lower)
    const second = logicalToX(lower + 1)
    return first === null || second === null || second <= first
      ? null
      : finite(lower + (x - first) / (second - first))
  }

  return Object.freeze({
    timeToLogical,
    timeToSlot: (timestamp: number) => nearestSlot(timeToLogical(timestamp)),
    logicalToTime,
    slotToTime,
    logicalToX,
    xToLogical,
    xToSlot: (x: number) => nearestSlot(xToLogical(x)),
    priceToY: (price: number) => finite(priceAxis.priceToY(price)),
    yToPrice: (y: number) => finite(priceAxis.yToPrice(y)),
  })
}
