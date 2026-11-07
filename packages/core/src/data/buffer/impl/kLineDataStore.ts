/**
 * K 线数据存储：唯一提交入口、稳定序号与已加载窗口。
 *
 * 所有写路径只负责算出「新序列 + 变化区间」，由 `commit` 统一维护
 * 时间戳唯一性、序号索引与变更信号；不在链路中途做第二套规范化。
 */
import type { KLineData } from '@/controllers/types.js'
import {
  createSignal,
  type ReadonlySignal,
  type WritableSignal,
} from '@/foundation/reactivity/signal.js'

import {
  DATA_CHANGE_KINDS,
  type DataChange,
  type DataChangeKind,
  type LoadedTimeRange,
} from '../types.js'
import { UniqueTimestampIndex } from './uniqueTimestampIndex.js'

/** updateBars 的写入结果：区分追加、替换与陈旧拒绝。 */
export interface UpdateBarsResult {
  readonly appendedCount: number
  readonly replacedCount: number
  readonly rejected: ReadonlyArray<KLineData>
}

/** 一次提交的变化区间；kind 决定消费方需要失效的范围。 */
interface CommitChange {
  readonly kind: DataChangeKind
  readonly start: number
  readonly end: number
}

/**
 * 实时帧可修订的末尾窗口大小（根）。
 * forming bar 更新与收线后短暂延迟的终值修订都落在末 1-2 根；更早的帧视为陈旧数据拒绝。
 */
const REALTIME_REVISABLE_TAIL_BARS = 2

/**
 * 按 timestamp 升序去重；同时间戳后写生效。
 * 这是所有写路径唯一的规范化入口，store 因此可以假设序列始终有序且唯一。
 */
function normalizeBars(bars: readonly KLineData[]): KLineData[] {
  const sorted = [...bars].sort((left, right) => left.timestamp - right.timestamp)
  const unique: KLineData[] = []
  for (const bar of sorted) {
    const last = unique[unique.length - 1]
    if (last && last.timestamp === bar.timestamp) unique[unique.length - 1] = bar
    else unique.push(bar)
  }
  return unique
}

/** 序列首元素为空时的初始变更描述。 */
function emptyChange(): DataChange<KLineData> {
  return { data: [], origin: 0, kind: DATA_CHANGE_KINDS.replace, start: 0, end: 0 }
}

export class KLineDataStore {
  private _data: KLineData[] = []
  private _origin = 0
  private _loadedTimeRange: LoadedTimeRange | null = null
  private readonly timestampIndex = new UniqueTimestampIndex()
  private readonly _dataSignal: WritableSignal<DataChange<KLineData>>

  /** 创建空数据存储和初始变更信号。 */
  constructor() {
    this._dataSignal = createSignal<DataChange<KLineData>>(emptyChange())
  }

  get data(): ReadonlySignal<DataChange<KLineData>> {
    return this._dataSignal
  }

  /** 首根已加载 K 线的稳定序号；prepend 后变小。 */
  get origin(): number {
    return this._origin
  }

  /** 返回当前已加载数据覆盖的时间范围。 */
  get loadedTimeRange(): LoadedTimeRange | null {
    return this._loadedTimeRange
  }

  /** 返回当前缓存的原始 K 线数组；数组归 store 所有，消费方不得修改。 */
  getRawData(): readonly KLineData[] {
    return this._data
  }

  /** 按唯一时间戳查找当前快照的逻辑下标。 */
  getLogicalIndexAtTimestamp(timestamp: number): number | null {
    const ordinal = this.timestampIndex.getOrdinal(timestamp)
    return ordinal === null ? null : ordinal - this._origin
  }

  /** 按唯一时间戳查找稳定序号；跨 prepend 不变。 */
  getOrdinalAtTimestamp(timestamp: number): number | null {
    return this.timestampIndex.getOrdinal(timestamp)
  }

  /**
   * 整体替换当前序列。
   *
   * 调用方提供完整数据，store 负责排序与唯一化；序号从 0 重新开始。
   */
  replace(bars: readonly KLineData[]): void {
    const normalized = normalizeBars(bars)
    this.commit(normalized, 0, {
      kind: DATA_CHANGE_KINDS.replace,
      start: 0,
      end: normalized.length,
    })
  }

  /**
   * 合并一页历史或增量。
   *
   * 分页可以整体早于首根、整体晚于末根，或同时跨过首尾；两端同时扩展时拆成
   * 前置与后置两次提交，前置只移动 origin。命中既有时间戳的条目丢弃；
   * 中间补洞属于数据源违约，直接拒绝。
   */
  mergePage(page: readonly KLineData[]): void {
    if (page.length === 0) return
    const normalized = normalizeBars(page)
    if (this._data.length === 0) {
      this.replace(normalized)
      return
    }

    const firstTimestamp = this._data[0]!.timestamp
    const lastTimestamp = this._data[this._data.length - 1]!.timestamp
    const older: KLineData[] = []
    const newer: KLineData[] = []
    for (const bar of normalized) {
      if (bar.timestamp < firstTimestamp) older.push(bar)
      else if (bar.timestamp > lastTimestamp) newer.push(bar)
      else if (this.timestampIndex.getOrdinal(bar.timestamp) === null)
        throw new RangeError('分页不能插入既有序列内部')
    }

    if (older.length > 0) {
      const next = [...older, ...this._data]
      this.commit(next, this._origin - older.length, {
        kind: DATA_CHANGE_KINDS.prepend,
        start: 0,
        end: older.length,
      })
    }
    if (newer.length > 0) {
      const start = this._data.length
      const next = [...this._data, ...newer]
      this.commit(next, this._origin, {
        kind: DATA_CHANGE_KINDS.append,
        start,
        end: next.length,
      })
    }
  }

  /**
   * 实时帧写入：replace-on-conflict 的末尾窗口合并。
   *
   * 同时间戳的末尾 bar 被新值替换（forming bar 更新）；晚于末根的时间戳追加；
   * 早于可修订窗口的陈旧帧拒绝。一次调用只发布一个数据快照。
   */
  applyRealtime(bars: readonly KLineData[]): UpdateBarsResult {
    if (bars.length === 0) return { appendedCount: 0, replacedCount: 0, rejected: [] }

    if (this._data.length === 0) {
      const seeded = normalizeBars(bars)
      this.replace(seeded)
      return { appendedCount: seeded.length, replacedCount: 0, rejected: [] }
    }

    const tailCount = Math.min(REALTIME_REVISABLE_TAIL_BARS, this._data.length)
    const windowStartTimestamp = this._data[this._data.length - tailCount]!.timestamp
    const accepted: KLineData[] = []
    const rejected: KLineData[] = []
    for (const bar of bars) {
      if (bar.timestamp >= windowStartTimestamp) accepted.push(bar)
      else rejected.push(bar)
    }
    if (accepted.length === 0) return { appendedCount: 0, replacedCount: 0, rejected }

    const normalized = normalizeBars(accepted)
    let appendedCount = 0
    let replacedCount = 0
    for (const bar of normalized) {
      if (this.timestampIndex.getOrdinal(bar.timestamp) === null) appendedCount += 1
      else replacedCount += 1
    }

    const previousTail = this._data.slice(this._data.length - tailCount)
    const tail = normalizeBars([...previousTail, ...normalized])
    const next = this._data.slice(0, this._data.length - tailCount)
    for (const bar of tail) next.push(bar)
    this.commit(next, this._origin, {
      kind: DATA_CHANGE_KINDS.tail,
      start: next.length - tail.length,
      end: next.length,
    })
    return { appendedCount, replacedCount, rejected }
  }

  /** 单根历史修正；序列长度与序号都不变。 */
  correct(bar: KLineData): void {
    const ordinal = this.timestampIndex.getOrdinal(bar.timestamp)
    if (ordinal === null) throw new RangeError('Historical correction must target an existing bar')
    const index = ordinal - this._origin
    const next = this._data.slice()
    next[index] = bar
    this.commit(next, this._origin, {
      kind: DATA_CHANGE_KINDS.correct,
      start: index,
      end: index + 1,
    })
  }

  /** 清空缓存、序号与已加载窗口。 */
  reset(): void {
    this._data = []
    this._origin = 0
    this.timestampIndex.clear()
    this._loadedTimeRange = null
    this._dataSignal.set(emptyChange())
  }

  /**
   * 唯一提交入口：接管新序列，维护序号索引与已加载窗口，发布一次变更快照。
   *
   * 序列在进入这里之前已经有序且唯一；`change` 只描述受影响的区间。
   */
  private commit(bars: KLineData[], origin: number, change: CommitChange): void {
    this._data = bars
    this._origin = origin
    if (change.kind === DATA_CHANGE_KINDS.replace) {
      this.timestampIndex.rebuild(bars, origin)
    } else if (change.kind !== DATA_CHANGE_KINDS.correct) {
      this.timestampIndex.addRange(bars, origin, change.start, change.end)
    }
    this._loadedTimeRange =
      bars.length === 0
        ? null
        : {
            earliestTs: bars[0]!.timestamp,
            latestTs: bars[bars.length - 1]!.timestamp,
          }
    this._dataSignal.set({
      data: bars,
      origin,
      kind: change.kind,
      start: change.start,
      end: change.end,
    })
  }
}
