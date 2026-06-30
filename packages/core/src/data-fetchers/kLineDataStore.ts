import { createSignal, type Signal } from '../reactivity/signal'
import type { KLineData } from '../controllers/types'
import type { DataWindow } from './dataBufferTypes'

export interface MergeResult {
  readonly prependedCount: number
  readonly advancedEarliest: boolean
}

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
  private _dataSignal: Signal<ReadonlyArray<KLineData>>
  private _loadedWindow: DataWindow | null = null

  constructor() {
    this._dataSignal = createSignal<ReadonlyArray<KLineData>>([])
  }

  get data(): Signal<ReadonlyArray<KLineData>> {
    return this._dataSignal
  }

  get loadedWindow(): DataWindow | null {
    return this._loadedWindow
  }

  getRawData(): KLineData[] {
    return this._data
  }

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
    this._dataSignal.set([...merged])
    this._updateWindow()

    return { prependedCount, advancedEarliest }
  }

  setInlineData(data: KLineData[]): void {
    this._data = [...data]
    this._dataSignal.set([...data])
    this._loadedWindow =
      data.length > 0
        ? { earliestTs: data[0]!.timestamp, latestTs: data[data.length - 1]!.timestamp }
        : null
  }

  reset(): void {
    this._data = []
    this._loadedWindow = null
    this._dataSignal.set([])
  }

  private _updateWindow(): void {
    if (this._data.length > 0) {
      const earliest = this._data[0]!.timestamp
      const latest = this._data[this._data.length - 1]!.timestamp
      if (!this._loadedWindow) {
        this._loadedWindow = { earliestTs: earliest, latestTs: latest }
      } else {
        this._loadedWindow = {
          earliestTs: Math.min(this._loadedWindow.earliestTs, earliest),
          latestTs: Math.max(this._loadedWindow.latestTs, latest),
        }
      }
    }
  }
}
