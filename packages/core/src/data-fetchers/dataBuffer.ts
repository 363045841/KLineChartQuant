import { createSignal, type Signal } from '../reactivity/signal'
import type { DataFetcher, KLineData, SymbolSpec } from '../controllers/types'
import type { DataBufferLike } from './dataBufferTypes'
import { Effect, pipe } from 'effect'
import type { Effect as EffectType } from 'effect/Effect'
import {
  fetchKLine,
  KLineFetchService,
  getPeriodDays,
  formatDate,
  MS_PER_DAY,
} from './dataBuffer.effects'

export interface DataWindow {
  earliestTs: number
  latestTs: number
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

export class DataBuffer implements DataBufferLike {
  private _data: KLineData[] = []
  private _dataSignal: Signal<ReadonlyArray<KLineData>>
  private _loadingSignal: Signal<boolean>
  private _fetcher: DataFetcher | null = null
  private _requestFetch:
    | ((spec: SymbolSpec, startTs: number, endTs: number) => Promise<ReadonlyArray<KLineData>>)
    | null = null
  private _currentSpec: SymbolSpec | null = null
  private _loadedWindow: DataWindow | null = null
  private _pendingFetch: Promise<void> | null = null
  private _disposed = false
  // 已尝试请求过的边界时间戳集合，防止同一个时间段重复请求
  private _attemptedBoundaries: Set<number> = new Set()
  private _monthKeys: Int32Array | null = null
  private _dayKeys: Int32Array | null = null

  onPrepend: ((count: number) => void) | null = null

  constructor() {
    this._dataSignal = createSignal<ReadonlyArray<KLineData>>([])
    this._loadingSignal = createSignal<boolean>(false)
  }

  get data(): Signal<ReadonlyArray<unknown>> {
    return this._dataSignal as Signal<ReadonlyArray<unknown>>
  }

  get loading(): Signal<boolean> {
    return this._loadingSignal
  }

  get currentSpec(): SymbolSpec | null {
    return this._currentSpec
  }

  get loadedWindow(): DataWindow | null {
    return this._loadedWindow
  }

  getRawData(): KLineData[] {
    return this._data
  }

  getMonthKeys(): Int32Array | null {
    return this._monthKeys
  }

  getDayKeys(): Int32Array | null {
    return this._dayKeys
  }

  private _precomputeKeys(): void {
    const n = this._data.length
    if (n === 0) {
      this._monthKeys = null
      this._dayKeys = null
      return
    }
    const monthKeys = new Int32Array(n)
    const dayKeys = new Int32Array(n)
    for (let i = 0; i < n; i++) {
      const d = new Date(this._data[i]!.timestamp)
      monthKeys[i] = d.getFullYear() * 12 + d.getMonth()
      const yearStart = new Date(d.getFullYear(), 0, 0)
      dayKeys[i] =
        d.getFullYear() * 366 + Math.floor((d.getTime() - yearStart.getTime()) / 86400000)
    }
    this._monthKeys = monthKeys
    this._dayKeys = dayKeys
  }

  setFetcher(fetcher: DataFetcher | null): void {
    this._fetcher = fetcher
  }

  setRequestFetch(
    fn:
      | ((spec: SymbolSpec, startTs: number, endTs: number) => Promise<ReadonlyArray<KLineData>>)
      | null,
  ): void {
    this._requestFetch = fn
  }

  setSymbol(spec: SymbolSpec, initialStartTs?: number): void {
    this._currentSpec = spec
    this._data = []
    this._loadedWindow = null
    this._attemptedBoundaries.clear()
    this._monthKeys = null
    this._dayKeys = null
    this._dataSignal.set([])
    if (initialStartTs !== undefined) {
      this.loadInitialRange(initialStartTs, Date.now())
    } else {
      this.loadInitial()
    }
  }

  ensureRange(requestStartTs: number, _requestEndTs: number): void {
    if (this._disposed || (!this._requestFetch && !this._fetcher) || !this._currentSpec) return
    if (this._currentSpec.incremental === false) return
    if (!this._currentSpec.source) return
    if (!this._loadedWindow) return

    if (requestStartTs >= this._loadedWindow.earliestTs) return

    const incrementalEnd = this._loadedWindow.earliestTs

    if (this._attemptedBoundaries.has(incrementalEnd)) return

    this._attemptedBoundaries.add(incrementalEnd)
    this.fetchRange(requestStartTs, incrementalEnd)
  }

  private loadInitial(): void {
    if ((!this._requestFetch && !this._fetcher) || !this._currentSpec || this._disposed) return
    if (!this._currentSpec.source) return

    const now = Date.now()
    const days = getPeriodDays(this._currentSpec.period)
    const startDate = now - days * MS_PER_DAY
    const endDate = now

    this.fetchRange(startDate, endDate)
  }

  private loadInitialRange(startTs: number, endTs: number): void {
    if ((!this._requestFetch && !this._fetcher) || !this._currentSpec || this._disposed) return
    if (!this._currentSpec.source) return
    this.fetchRange(startTs, endTs)
  }

  private fetchRange(startTs: number, endTs: number): void {
    if ((!this._requestFetch && !this._fetcher) || !this._currentSpec || this._disposed) return
    if (this._currentSpec.incremental === false) return

    if (this._pendingFetch) {
      this._pendingFetch = this._pendingFetch.then(() => {
        if (this._disposed) return
        return this.fetchRange(startTs, endTs)
      })
      return
    }

    const spec = this._currentSpec
    this._loadingSignal.set(true)

    const service: {
      readonly fetch: (
        spec: SymbolSpec,
        startTs: number,
        endTs: number,
      ) => EffectType<ReadonlyArray<KLineData>, unknown>
    } = {
      fetch: (s, start, end) =>
        Effect.tryPromise({
          try: () => {
            if (!s.source) {
              return Promise.reject(
                new Error(`[DataBuffer] source is required for symbol "${s.symbol}"`),
              )
            }
            if (this._requestFetch) {
              return this._requestFetch(s, start, end)
            }
            return (this._fetcher as NonNullable<DataFetcher>)(s.source, {
              symbol: s.symbol,
              startDate: formatDate(start),
              endDate: formatDate(end),
              period: s.period ?? 'daily',
              adjust: s.adjust ?? 'none',
              exchange: s.exchange,
            })
          },
          catch: (e) => e,
        }),
    }

    this._pendingFetch = pipe(
      fetchKLine(spec, startTs, endTs),
      Effect.provideService(KLineFetchService, service),
      Effect.runPromise, // 链式传递返回值, Effect -> Promise -> run
    )
      .then((incoming) => {
        if (this._disposed) return

        const oldLength = this._data.length
        const oldEarliestTs = oldLength > 0 ? this._data[0]!.timestamp : null
        const merged = mergeSortedData(this._data, [...incoming])
        const newEarliestTs = merged[0]?.timestamp ?? null
        const advancedEarliest =
          oldEarliestTs !== null && newEarliestTs !== null && newEarliestTs < oldEarliestTs

        if (oldLength > 0 && merged.length > oldLength && advancedEarliest) {
          const prependCount = merged.findIndex((d) => d.timestamp === oldEarliestTs)
          if (prependCount > 0) {
            this.onPrepend?.(prependCount)
          }
        }

        if (oldLength > 0 && !advancedEarliest) {
          this._attemptedBoundaries.delete(endTs)
        }

        this._data = merged
        this._dataSignal.set([...merged])
        this._precomputeKeys()

        if (merged.length > 0) {
          const newEarliest = merged[0]!.timestamp
          const newLatest = merged[merged.length - 1]!.timestamp
          if (!this._loadedWindow) {
            this._loadedWindow = { earliestTs: newEarliest, latestTs: newLatest }
          } else {
            this._loadedWindow = {
              earliestTs: Math.min(this._loadedWindow.earliestTs, newEarliest),
              latestTs: Math.max(this._loadedWindow.latestTs, newLatest),
            }
          }
        }
      })
      .catch(() => {
        this._attemptedBoundaries.delete(endTs)
      })
      .finally(() => {
        this._pendingFetch = null
        if (!this._disposed) {
          this._loadingSignal.set(false)
        }
      })
  }

  /**
   * Put the buffer in inline mode — use the provided data directly
   * instead of fetching. Sets data signal and tracks loadedWindow.
   */
  setInlineData(data: unknown[]): void {
    if (this._disposed) return
    const kData = data as KLineData[]
    this._data = [...kData]
    this._dataSignal.set([...kData])
    if (data.length > 0) {
      this._loadedWindow = {
        earliestTs: kData[0]!.timestamp,
        latestTs: kData[kData.length - 1]!.timestamp,
      }
    } else {
      this._loadedWindow = null
    }
    this._attemptedBoundaries.clear()
    this._precomputeKeys()
  }

  /**
   * Update just the spec metadata without triggering any fetch.
   */
  setCurrentSpec(spec: SymbolSpec): void {
    this._currentSpec = spec
  }

  dispose(): void {
    this._disposed = true
    this._pendingFetch = null
    this._data = []
    this._loadedWindow = null
    this._attemptedBoundaries.clear()
    this._monthKeys = null
    this._dayKeys = null
  }
}
