import { Effect, pipe } from 'effect'
import type { Effect as EffectType } from 'effect/Effect'

import type { DataFetcher, KLineData, SymbolSpec } from '../controllers/types'
import { createSignal, type Signal } from '../foundation/reactivity/signal'

import {
  fetchKLine,
  KLineFetchService,
  getPeriodDays,
  formatDate,
  MS_PER_DAY,
} from './dataBuffer.effects'
import type { DataBufferLike, DataWindow, DataChange, KLineBuffer } from './dataBufferTypes'
import { FetchScheduler } from './fetchScheduler'
import { KLineDataStore } from './kLineDataStore'
import { TimeKeyIndex } from './timeKeyIndex'

export class DataBuffer implements KLineBuffer {
  private _store = new KLineDataStore()
  private _scheduler = new FetchScheduler()
  private _keyIndex = new TimeKeyIndex()
  private _fetcher: DataFetcher | null = null
  private _requestFetch:
    | ((spec: SymbolSpec, startTs: number, endTs: number) => Promise<ReadonlyArray<KLineData>>)
    | null = null
  private _currentSpec: SymbolSpec | null = null
  /** 当前 inflight 请求的 boundary（earliestTs），最多一个 */
  private _inflightBoundary: number | null = null
  /** inflight 期间记录的最宽 requestStartTs */
  private _pendingRequestStartTs: number | null = null
  private _disposed = false

  constructor() {}

  get data(): Signal<DataChange> {
    return this._store.data
  }

  get loading(): Signal<boolean> {
    return this._scheduler.loading
  }

  get currentSpec(): SymbolSpec | null {
    return this._currentSpec
  }

  get loadedWindow(): DataWindow | null {
    return this._store.loadedWindow
  }

  getRawData(): KLineData[] {
    return this._store.getRawData()
  }

  getMonthKeys(): Int32Array | null {
    return this._keyIndex.monthKeys
  }

  getDayKeys(): Int32Array | null {
    return this._keyIndex.dayKeys
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
    this._store.reset()
    this._scheduler.reset()
    this._keyIndex.reset()
    this._inflightBoundary = null
    this._pendingRequestStartTs = null
    if (initialStartTs !== undefined) {
      this._loadInitialRange(initialStartTs, Date.now())
    } else {
      this._loadInitial()
    }
  }

  ensureRange(requestStartTs: number, _requestEndTs: number): void {
    if (this._disposed || (!this._requestFetch && !this._fetcher) || !this._currentSpec) return
    if (this._currentSpec.incremental === false) return
    if (!this._currentSpec.source) return
    const window = this._store.loadedWindow
    if (!window) return

    if (requestStartTs >= window.earliestTs) return

    const incrementalEnd = window.earliestTs
    if (this._inflightBoundary === incrementalEnd) {
      if (this._pendingRequestStartTs === null || requestStartTs < this._pendingRequestStartTs) {
        this._pendingRequestStartTs = requestStartTs
      }
      return
    }

    this._inflightBoundary = incrementalEnd
    this._pendingRequestStartTs = requestStartTs
    this._fetchAndMerge(requestStartTs, incrementalEnd)
  }

  setInlineData(data: unknown[]): void {
    if (this._disposed) return
    this._store.setInlineData(data as KLineData[])
    this._scheduler.reset()
    this._inflightBoundary = null
    this._pendingRequestStartTs = null
    this._keyIndex.recompute(this._store.getRawData())
  }

  setCurrentSpec(spec: SymbolSpec): void {
    this._currentSpec = spec
  }

  dispose(): void {
    this._disposed = true
    this._scheduler.dispose()
    this._store.reset()
    this._keyIndex.reset()
    this._inflightBoundary = null
    this._pendingRequestStartTs = null
  }

  // ── Private ──

  private _loadInitial(): void {
    if ((!this._requestFetch && !this._fetcher) || !this._currentSpec || this._disposed) return
    if (!this._currentSpec.source) return

    const now = Date.now()
    const days = getPeriodDays(this._currentSpec.period)
    const startDate = now - days * MS_PER_DAY

    this._fetchAndMerge(startDate, now)
  }

  private _loadInitialRange(startTs: number, endTs: number): void {
    if ((!this._requestFetch && !this._fetcher) || !this._currentSpec || this._disposed) return
    if (!this._currentSpec.source) return
    this._fetchAndMerge(startTs, endTs)
  }

  private _fetchAndMerge(startTs: number, endTs: number): void {
    if ((!this._requestFetch && !this._fetcher) || !this._currentSpec || this._disposed) return
    if (this._currentSpec.incremental === false) return

    const spec = this._currentSpec
    const requestFetch = this._requestFetch
    const fetcher = this._fetcher
    const disposed = (): boolean => this._disposed

    const fetchEffect = (): Promise<ReadonlyArray<KLineData>> => {
      const service: {
        readonly fetch: (
          s: SymbolSpec,
          start: number,
          end: number,
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
              if (requestFetch) {
                return requestFetch(s, start, end)
              }
              return (fetcher as NonNullable<DataFetcher>)(s.source, {
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

      return pipe(
        fetchKLine(spec, startTs, endTs),
        Effect.provideService(KLineFetchService, service),
        Effect.runPromise,
      )
    }

    this._scheduler
      .run(fetchEffect)
      .then((incoming) => {
        if (disposed()) return

        const result = this._store.merge(incoming)
        this._keyIndex.recompute(this._store.getRawData())

        this._inflightBoundary = null
        const pending = this._pendingRequestStartTs
        this._pendingRequestStartTs = null
        if (result.advancedEarliest && pending !== null) {
          this.ensureRange(pending, this._store.loadedWindow!.earliestTs)
        }
      })
      .catch(() => {
        this._inflightBoundary = null
        this._pendingRequestStartTs = null
      })
  }
}
