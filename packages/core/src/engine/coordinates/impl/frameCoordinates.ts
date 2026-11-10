/** 每个帧上下文只绑定一个公开坐标服务，绘制、交互及外部调用共用该实例。 */
import { DRAWING_FUTURE_BARS, timeValue } from '@363045841yyt/klinechart-plot-contracts'
import { logicalIndexToScreenX } from '@/engine/viewport/logicalIndexToScreenX.js'
import { createKLineSlotGrid } from '@/engine/viewport/slotGrid.js'
import type { RenderContext } from '@/foundation/plugin/types.js'
import { ChartDataViewId } from '@/foundation/types/chartView.js'
import type { DrawingCoordinateApi } from '../types.js'

const coordinatesByFrame = new WeakMap<RenderContext, DrawingCoordinateApi>()

/** 有限的坐标值才可以离开坐标边界。 */
function finite(value: number): number | null {
  return Number.isFinite(value) ? value : null
}

/** 时间和指针共享最近槽位规则；无可用坐标时不生成替代槽位。 */
function nearestSlot(value: number | null): number | null {
  return value === null ? null : Math.round(value)
}

/** 绑定帧快照；同一上下文反复查询返回同一只读服务，不保存第二份行情或绘图。 */
export function getFrameCoordinates(context: RenderContext): DrawingCoordinateApi {
  const cached = coordinatesByFrame.get(context)
  if (cached) return cached
  const { data } = context
  const lastIndex = data.length - 1
  const grid =
    context.dataView === ChartDataViewId.KLine
      ? createKLineSlotGrid(context.kWidth, context.kGap, context.dpr)
      : undefined

  /** 创建锚点所需的实际开盘时间；未知未来槽位不允许以收盘时间代替。 */
  function slotToTime(index: number): number | null {
    if (!Number.isInteger(index) || index < 0 || index > lastIndex + DRAWING_FUTURE_BARS)
      return null
    const actual = data[index]?.timestamp
    if (actual !== undefined) return actual
    const timestamp = context.getTimestampAtLogicalIndex(index)
    return timestamp === null ? null : finite(timestamp)
  }

  /** 时间投影的节点；末根收盘边界仅补齐该根内部的连续定位。 */
  function slotTime(index: number): number | null {
    const actual = slotToTime(index)
    if (actual !== null) return actual
    const lastOpen = data[lastIndex]?.timestamp
    if (
      index !== data.length ||
      lastOpen === undefined ||
      context.dataView !== ChartDataViewId.KLine ||
      !context.marketSession
    )
      return null
    const close = timeValue(
      { period: context.period, session: context.marketSession },
      'close',
      context.period,
      lastOpen,
    )
    return close !== undefined && close > lastOpen ? close : null
  }

  /** 在同一组时间节点之间插值；范围左侧沿首段延展，未来必须有已知时间节点。 */
  function logicalToTime(index: number): number | null {
    if (!Number.isFinite(index) || data.length === 0) return null
    if (Number.isInteger(index) && index >= 0) return slotTime(index)
    const lower = index < 0 ? 0 : Math.floor(index)
    const first = slotTime(lower)
    const second = slotTime(lower + 1)
    if (first === null || second === null || second <= first) return null
    return finite(first + (second - first) * (index - lower))
  }

  /** 二分真实行情，再查询未来日历；与反向转换使用相同的节点和插值规则。 */
  function timeToLogical(timestamp: number): number | null {
    if (!Number.isFinite(timestamp) || data.length === 0) return null
    let low = 0
    let high = lastIndex
    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      const value = data[middle]!.timestamp
      if (value === timestamp) return middle
      if (value < timestamp) low = middle + 1
      else high = middle - 1
    }
    if (low < data.length) {
      const firstIndex = Math.max(0, low - 1)
      const first = data[firstIndex]!.timestamp
      const second = data[firstIndex + 1]?.timestamp
      return second === undefined
        ? null
        : finite(firstIndex + (timestamp - first) / (second - first))
    }
    let previousTime = data[lastIndex]!.timestamp
    for (let index = data.length; index <= lastIndex + DRAWING_FUTURE_BARS; index++) {
      const next = slotTime(index)
      if (next === null || next <= previousTime) return null
      if (timestamp <= next) return index - 1 + (timestamp - previousTime) / (next - previousTime)
      previousTime = next
    }
    return null
  }

  /** 使用封存的中心点和像素网格，所有图元共享同一投影。 */
  function logicalToX(index: number): number | null {
    return logicalIndexToScreenX({
      index,
      visibleRange: context.range,
      centers: context.kLineCenters,
      scrollLeft: context.scrollLeft,
      dpr: context.dpr,
      fallbackStep: context.kWidth + context.kGap,
      grid,
    })
  }

  /** 在实际显示的相邻中心之间反算，保留大周期内的分数位置。 */
  function xToLogical(x: number): number | null {
    if (!Number.isFinite(x) || context.kLineCenters.length === 0) return null
    let low = context.range.start
    let high = low + context.kLineCenters.length - 1
    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      const center = logicalToX(middle)
      if (center === null) return null
      if (center === x) return middle
      if (center < x) low = middle + 1
      else high = middle - 1
    }
    let lower = low - 1
    // 视口外沿无界网格定位，随后仍使用相邻显示中心求局部分数。
    if (grid && (low <= context.range.start || low >= context.range.end)) {
      lower = Math.floor((x + context.scrollLeft - grid.origin) / grid.step)
    }
    const first = logicalToX(lower)
    const second = logicalToX(lower + 1)
    return first === null || second === null || second <= first
      ? null
      : finite(lower + (x - first) / (second - first))
  }

  /** 创建、渲染和命中统一采用最近槽位，不把投影后的时间回写文档。 */
  function timeToSlot(timestamp: number): number | null {
    const index = nearestSlot(timeToLogical(timestamp))
    // 末根收盘节点只属于连续时间投影；缺少下一开盘时，最近可用槽位仍是末根。
    if (index === data.length && slotToTime(index) === null)
      return lastIndex >= 0 ? lastIndex : null
    return index
  }

  const api: DrawingCoordinateApi = Object.freeze({
    timeToLogical,
    timeToSlot,
    logicalToTime,
    slotToTime,
    logicalToX,
    xToLogical,
    xToSlot: (x: number) => nearestSlot(xToLogical(x)),
    priceToY: (price: number) => finite(context.pane.yAxis.priceToY(price)),
    yToPrice: (y: number) => finite(context.pane.yAxis.yToPrice(y)),
  })
  coordinatesByFrame.set(context, api)
  return api
}
