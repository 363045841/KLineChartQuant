/** K 线数据存储：按时间戳去重合并增量数据、维护已加载窗口，并通过信号发布数据变更。 */
import type { KLineData } from '../../controllers/types.js'
import {
  createSignal,
  type ReadonlySignal,
  type WritableSignal,
} from '../../foundation/reactivity/signal.js'

import type { DataChange, LoadedTimeRange } from './dataBufferTypes.js'
import { UniqueTimestampIndex } from './uniqueTimestampIndex.js'

export interface MergeResult {
  readonly prependedCount: number
  readonly advancedEarliest: boolean
}

/** updateBars 的写入结果：区分追加、替换与陈旧拒绝。 */
export interface UpdateBarsResult {
  readonly appendedCount: number
  readonly replacedCount: number
  readonly rejected: ReadonlyArray<KLineData>
}

/**
 * 实时帧可修订的末尾窗口大小（根）。
 * forming bar 更新与收线后短暂延迟的终值修订都落在末 1-2 根；更早的帧视为陈旧数据拒绝。
 */
const REALTIME_REVISABLE_TAIL_BARS = 2

/** 按时间戳去重并合并两批 K 线数据。 */
function mergeSortedData(existing: KLineData[], incoming: KLineData[]): KLineData[] {
  if (existing.length === 0) return [...incoming]
  if (incoming.length === 0) return [...existing]

  const tsSet = new Set<number>(existing.map((d) => d.timestamp))
  const unique = incoming.filter((d) => !tsSet.has(d.timestamp))
  if (unique.length === 0) return existing

  const merged = [...existing, ...unique]
  merged.sort((a, b) => a.timestamp - b.timestamp)
  return merged
}

export class KLineDataStore {
  private _data: KLineData[] = []
  private _dataSignal: WritableSignal<DataChange<KLineData>>
  private _loadedTimeRange: LoadedTimeRange | null = null
  private readonly timestampIndex = new UniqueTimestampIndex()

  /** 创建空数据存储和初始变更信号。 */
  constructor() {
    this._dataSignal = createSignal<DataChange<KLineData>>({ data: [], prependedCount: 0 })
  }

  get data(): ReadonlySignal<DataChange<KLineData>> {
    return this._dataSignal
  }

  /** 返回当前已加载数据覆盖的时间范围。 */
  get loadedTimeRange(): LoadedTimeRange | null {
    return this._loadedTimeRange
  }

  /** 返回当前缓存的原始 K 线数组。 */
  getRawData(): KLineData[] {
    return this._data
  }

  /** 按唯一时间戳查找当前数据快照的逻辑索引。 */
  getLogicalIndexAtTimestamp(timestamp: number): number | null {
    return this.timestampIndex.get(timestamp)
  }

  /** 合并新数据并发布包含前置插入数量的变更快照。 */
  merge(incoming: ReadonlyArray<KLineData>): MergeResult {
    if (incoming.length === 0) return { prependedCount: 0, advancedEarliest: false }

    const oldLength = this._data.length
    const oldEarliestTs = oldLength > 0 ? this._data[0]!.timestamp : null
    const merged = mergeSortedData(this._data, [...incoming])
    const newEarliestTs = merged[0]?.timestamp ?? null
    const advancedEarliest =
      oldEarliestTs !== null && newEarliestTs !== null && newEarliestTs < oldEarliestTs

    let prependedCount = 0
    if (oldLength > 0 && merged.length > oldLength && advancedEarliest) {
      prependedCount = merged.findIndex((d) => d.timestamp === oldEarliestTs)
    }

    this._data = merged
    this.timestampIndex.rebuild(this._data)
    this._updateWindow()
    this._dataSignal.set({ data: [...merged], prependedCount })

    return { prependedCount, advancedEarliest }
  }

  /** 以静态内联数据整体替换当前缓存。 */
  setInlineData(data: KLineData[]): void {
    this._data = [...data]
    this.timestampIndex.rebuild(this._data)
    this._dataSignal.set({ data: [...data], prependedCount: 0 })
    this._loadedTimeRange =
      data.length > 0
        ? { earliestTs: data[0]!.timestamp, latestTs: data[data.length - 1]!.timestamp }
        : null
  }

  /**
   * 实时帧写入：replace-on-conflict 的末尾窗口合并。
   *
   * 与 merge() 的保旧弃新不同，同时间戳的末尾 bar 会被新值替换（forming bar 更新）；
   * 晚于末根的时间戳追加；早于可修订窗口（末 REALTIME_REVISABLE_TAIL_BARS 根）的陈旧帧拒绝。
   * 一次调用只发布一个数据快照（closed+forming 批合并为原子写）。
   */
  updateBars(bars: ReadonlyArray<KLineData>): UpdateBarsResult {
    if (bars.length === 0) return { appendedCount: 0, replacedCount: 0, rejected: [] }

    // 空存储：整批作为初始序列（批内重复时间戳按后写生效）
    if (this._data.length === 0) {
      const byTs = new Map<number, KLineData>()
      for (const bar of bars) byTs.set(bar.timestamp, bar)
      const seeded = [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp)
      return this._commitRealtimeWrite(seeded, seeded.length, 0, [])
    }

    const tailCount = Math.min(REALTIME_REVISABLE_TAIL_BARS, this._data.length)
    const windowStartTs = this._data[this._data.length - tailCount]!.timestamp

    const accepted: KLineData[] = []
    const rejected: KLineData[] = []
    for (const bar of bars) {
      if (bar.timestamp >= windowStartTs) accepted.push(bar)
      else rejected.push(bar)
    }
    if (accepted.length === 0) {
      return { appendedCount: 0, replacedCount: 0, rejected }
    }

    // 可修订尾段与帧合并：同时间戳帧覆盖旧值，新时间戳插入
    const existingTs = new Set(this._data.map((item) => item.timestamp))
    const mergedTail = new Map<number, KLineData>()
    for (const bar of this._data.slice(this._data.length - tailCount)) {
      mergedTail.set(bar.timestamp, bar)
    }
    let appendedCount = 0
    let replacedCount = 0
    for (const bar of accepted) {
      if (!mergedTail.has(bar.timestamp) && !existingTs.has(bar.timestamp)) appendedCount += 1
      else replacedCount += 1
      mergedTail.set(bar.timestamp, bar)
    }
    const head = this._data.slice(0, this._data.length - tailCount)
    const next = [...head, ...[...mergedTail.values()].sort((a, b) => a.timestamp - b.timestamp)]
    this._commitRealtimeWrite(next, appendedCount, replacedCount, rejected)
    return { appendedCount, replacedCount, rejected }
  }

  /** 提交实时写入结果：重建索引、扩窗并发布单次数据快照。 */
  private _commitRealtimeWrite(
    next: KLineData[],
    appendedCount: number,
    replacedCount: number,
    rejected: ReadonlyArray<KLineData>,
  ): UpdateBarsResult {
    this._data = next
    this.timestampIndex.rebuild(this._data)
    this._updateWindow()
    this._dataSignal.set({ data: [...next], prependedCount: 0 })
    return { appendedCount, replacedCount, rejected }
  }

  /** 清空缓存、加载窗口和数据变更快照。 */
  reset(): void {
    this._data = []
    this.timestampIndex.rebuild(this._data)
    this._loadedTimeRange = null
    this._dataSignal.set({ data: [], prependedCount: 0 })
  }

  /** 根据当前缓存更新已加载的时间窗口。 */
  private _updateWindow(): void {
    if (this._data.length > 0) {
      const earliest = this._data[0]!.timestamp
      const latest = this._data[this._data.length - 1]!.timestamp
      if (!this._loadedTimeRange) {
        this._loadedTimeRange = { earliestTs: earliest, latestTs: latest }
      } else {
        this._loadedTimeRange = {
          earliestTs: Math.min(this._loadedTimeRange.earliestTs, earliest),
          latestTs: Math.max(this._loadedTimeRange.latestTs, latest),
        }
      }
    }
  }
}
