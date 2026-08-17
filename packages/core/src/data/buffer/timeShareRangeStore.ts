/** 多日分时存储：保存按日分组的不可变快照，并为现有渲染链路发布扁平点列投影。 */
import {
  batch,
  createSignal,
  type ReadonlySignal,
  type WritableSignal,
} from '../../foundation/reactivity/signal'
import type { TimeShareData } from '../../foundation/types/price'
import type { TimeShareDay, TimeShareRange } from '../provider/types'

import type { DataChange, DataWindow } from './dataBufferTypes'

/** 复制单个分时点，阻止调用方后续修改传入对象。 */
function copyPoint(point: TimeShareData): TimeShareData {
  return Object.freeze({ ...point })
}

/** 复制单个交易日及其点列，保留服务端给出的交易日顺序。 */
function copyDay(day: TimeShareDay): TimeShareDay {
  return Object.freeze({
    tradingDate: day.tradingDate,
    preClose: day.preClose,
    data: Object.freeze(day.data.map(copyPoint)),
  })
}

/** 创建与外部输入解耦的多日分时快照。 */
function copyRange(range: TimeShareRange): TimeShareRange {
  return Object.freeze({
    instrumentId: range.instrumentId,
    timezone: range.timezone,
    requestedDays: range.requestedDays,
    olderData: range.olderData,
    days: Object.freeze(range.days.map(copyDay)),
  })
}

/** 按交易日顺序展开点列，扁平结果仅作为当前渲染链路的派生视图。 */
function flattenDays(days: ReadonlyArray<TimeShareDay>): TimeShareData[] {
  const result: TimeShareData[] = []
  for (const day of days) result.push(...day.data)
  return result
}

/** 根据当前扁平投影计算已加载时间窗口。 */
function resolveLoadedWindow(data: ReadonlyArray<TimeShareData>): DataWindow | null {
  if (data.length === 0) return null
  return {
    earliestTs: data[0]!.timestamp,
    latestTs: data[data.length - 1]!.timestamp,
  }
}

/** 保存分组 Range，并集中维护兼容渲染层所需的扁平投影。 */
export class TimeShareRangeStore {
  private _range: TimeShareRange | null = null
  private _flatData: TimeShareData[] = []
  private _loadedWindow: DataWindow | null = null
  private readonly _rangeSignal: WritableSignal<TimeShareRange | null> =
    createSignal<TimeShareRange | null>(null)
  private readonly _dataSignal: WritableSignal<DataChange> = createSignal<DataChange>({
    data: [],
    prependedCount: 0,
  })

  /** 返回按日分组的只读响应式快照。 */
  get range(): ReadonlySignal<TimeShareRange | null> {
    return this._rangeSignal
  }

  /** 返回供现有 Buffer 订阅的扁平数据变化信号。 */
  get data(): ReadonlySignal<DataChange> {
    return this._dataSignal
  }

  /** 返回当前扁平数据覆盖的时间范围。 */
  get loadedWindow(): DataWindow | null {
    return this._loadedWindow
  }

  /** 返回当前分组快照；调用方只能通过 setRange 替换状态。 */
  getRange(): TimeShareRange | null {
    return this._range
  }

  /** 返回按交易日顺序展开的兼容点列。 */
  getRawData(): TimeShareData[] {
    return [...this._flatData]
  }

  /** 返回最新交易日昨收，作为统一绝对价格轴的涨跌幅参考。 */
  getLatestPreClose(): number | null {
    const days = this._range?.days
    return days?.[days.length - 1]?.preClose ?? null
  }

  /** 原子替换分组 Range 及其扁平投影。 */
  setRange(range: TimeShareRange): void {
    const snapshot = copyRange(range)
    const flatData = flattenDays(snapshot.days)
    this._range = snapshot
    this._flatData = flatData
    this._loadedWindow = resolveLoadedWindow(flatData)
    batch(() => {
      this._rangeSignal.set(snapshot)
      this._dataSignal.set({ data: [...flatData], prependedCount: 0 })
    })
  }

  /** 写入旧单日接口的扁平数据，并清除不再匹配的分组 Range。 */
  setInlineData(data: ReadonlyArray<TimeShareData>): void {
    const snapshot = data.map(copyPoint)
    this._range = null
    this._flatData = snapshot
    this._loadedWindow = resolveLoadedWindow(snapshot)
    batch(() => {
      this._rangeSignal.set(null)
      this._dataSignal.set({ data: [...snapshot], prependedCount: 0 })
    })
  }

  /** 清空分组、扁平投影和时间窗口。 */
  reset(): void {
    this._range = null
    this._flatData = []
    this._loadedWindow = null
    batch(() => {
      this._rangeSignal.set(null)
      this._dataSignal.set({ data: [], prependedCount: 0 })
    })
  }
}
