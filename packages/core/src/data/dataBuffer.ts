import { Effect, pipe } from 'effect'
import type { Effect as EffectType } from 'effect/Effect'

import type { DataFetcher, KLineData, SymbolSpec } from '../controllers/types'
import {
  createSignal,
  type ReadonlySignal,
  type WritableSignal,
} from '../foundation/reactivity/signal'

import {
  fetchKLine,
  FETCH_TOTAL_ATTEMPTS,
  KLineFetchService,
  getPeriodDays,
  formatDate,
  MS_PER_DAY,
  retryBackoffMs,
} from './dataBuffer.effects'
import type { DataBufferLike, DataWindow, DataChange, KLineBuffer } from './dataBufferTypes'
import { FetchScheduler } from './fetchScheduler'
import { KLineDataStore } from './kLineDataStore'
import { TimeKeyIndex } from './timeKeyIndex'

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message
  if (err != null && String(err).trim()) return String(err)
  return '加载失败'
}

// 按当前重试次数等待退避时间，避免请求连续打满上游。
function waitForRetry(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, retryBackoffMs(attempt)))
}

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
  private _requestVersion = 0
  private _disposed = false
  private _lastError: WritableSignal<string | null> = createSignal<string | null>(null)

  constructor() {}

  get data(): ReadonlySignal<DataChange> {
    return this._store.data
  }

  get loading(): ReadonlySignal<boolean> {
    return this._scheduler.loading
  }

  get lastError(): ReadonlySignal<string | null> {
    return this._lastError
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
    this._requestVersion++
    this._currentSpec = spec
    this._store.reset()
    this._scheduler.reset()
    this._keyIndex.reset()
    this._inflightBoundary = null
    this._pendingRequestStartTs = null
    this._lastError.set(null)
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
    this._requestVersion++
    this._store.setInlineData(data as KLineData[])
    this._scheduler.reset()
    this._inflightBoundary = null
    this._pendingRequestStartTs = null
    this._lastError.set(null)
    this._keyIndex.recompute(this._store.getRawData())
  }

  setCurrentSpec(spec: SymbolSpec): void {
    this._requestVersion++
    this._currentSpec = spec
  }

  dispose(): void {
    this._disposed = true
    this._requestVersion++
    this._scheduler.dispose()
    this._store.reset()
    this._keyIndex.reset()
    this._inflightBoundary = null
    this._pendingRequestStartTs = null
    this._lastError.set(null)
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
    const requestVersion = this._requestVersion
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
                params: s.params,
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
      .run(async () => {
        try {
          let incoming: ReadonlyArray<KLineData> | undefined
          for (let attempt = 1; attempt <= FETCH_TOTAL_ATTEMPTS; attempt++) {
            try {
              incoming = await fetchEffect()
              break
            } catch (err) {
              if (disposed() || requestVersion !== this._requestVersion) return
              if (attempt === FETCH_TOTAL_ATTEMPTS) throw err
              this._lastError.set(`${errorMessage(err)} Retry ${attempt}/${FETCH_TOTAL_ATTEMPTS}`)
              await waitForRetry(attempt)
            }
          }
          if (incoming === undefined || disposed() || requestVersion !== this._requestVersion)
            return

          // 成功空数组：接口无 K 线，记可读原因供 chip 展示
          this._lastError.set(incoming.length === 0 ? '暂无K线数据' : null)
          const result = this._store.merge(incoming)
          this._keyIndex.recompute(this._store.getRawData())

          this._inflightBoundary = null
          const pending = this._pendingRequestStartTs
          this._pendingRequestStartTs = null
          if (result.advancedEarliest && pending !== null) {
            this.ensureRange(pending, this._store.loadedWindow!.earliestTs)
          }
        } catch (err) {
          if (disposed() || requestVersion !== this._requestVersion) return
          this._lastError.set(errorMessage(err))
          this._inflightBoundary = null
          this._pendingRequestStartTs = null
        }
      })
      .catch(() => {
        // task 内已处理失败；此处仅吞掉 scheduler 链上的 residual reject
      })
  }
}
