/** K 线数据存储：按时间戳去重合并增量数据、维护已加载窗口，并通过信号发布数据变更。 */
import type { KLineData } from '../../controllers/types'
import {
  createSignal,
  type ReadonlySignal,
  type WritableSignal,
} from '../../foundation/reactivity/signal'

import type { LoadedTimeRange, DataChange } from './dataBufferTypes'

export interface MergeResult {
  readonly prependedCount: number
  readonly advancedEarliest: boolean
}

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
    this._updateWindow()
    this._dataSignal.set({ data: [...merged], prependedCount })

    return { prependedCount, advancedEarliest }
  }

  /** 以静态内联数据整体替换当前缓存。 */
  setInlineData(data: KLineData[]): void {
    this._data = [...data]
    this._dataSignal.set({ data: [...data], prependedCount: 0 })
    this._loadedTimeRange =
      data.length > 0
        ? { earliestTs: data[0]!.timestamp, latestTs: data[data.length - 1]!.timestamp }
        : null
  }

  /** 清空缓存、加载窗口和数据变更快照。 */
  reset(): void {
    this._data = []
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
