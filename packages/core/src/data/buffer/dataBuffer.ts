/** K 线数据增量缓冲：管理初始/滚动加载、缓存合并、重试与加载/错误状态，对渲染层屏蔽取数细节。 */
import { Effect, pipe } from 'effect'
import type { Effect as EffectType } from 'effect/Effect'

import type { KLineData, SymbolSpec } from '../../controllers/types'
import { OLDER_DATA_STATUS, type OlderDataStatus } from '../provider/types'
import {
  createSignal,
  type ReadonlySignal,
  type WritableSignal,
} from '../../foundation/reactivity/signal'

import {
  fetchKLine,
  DEFAULT_BAR_PAGE_LIMIT,
  FETCH_TOTAL_ATTEMPTS,
  KLineFetchService,
  retryBackoffMs,
} from './dataBuffer.effects'
import type {
  BarPageRequest,
  BarPageResult,
  DataBufferLike,
  LoadedTimeRange,
  DataChange,
  KLineBuffer,
} from './dataBufferTypes'
import { FetchScheduler } from './fetchScheduler'
import { KLineDataStore } from './kLineDataStore'
import { TimeKeyIndex } from './timeKeyIndex'
import { AUTO_SOURCE_ID } from './seriesRepository'

/** 将未知异常转换为可展示的错误信息。 */
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
  private _requestFetch:
    ((spec: SymbolSpec, page: BarPageRequest) => Promise<BarPageResult>) | null = null
  private _sourceResolvedHandler:
    | ((sourceId: string, instrument: import('../provider/types').InstrumentDescriptor) => boolean)
    | null = null
  /** 后端声明的当前缓存左侧历史状态；仅 exhausted 会停止继续翻页。 */
  private _olderData: OlderDataStatus = OLDER_DATA_STATUS.UNKNOWN
  private _currentSpec: SymbolSpec | null = null
  /** 当前 inflight 请求的 boundary（earliestTs），最多一个 */
  private _inflightBoundary: number | null = null
  /** inflight 期间记录的最宽 requestStartTs */
  private _pendingRequestStartTs: number | null = null
  /** 标记 setSymbol 传入的初始左边界，避免与普通分页 pending 混用。 */
  private _initialRangePending = false
  private _requestVersion = 0
  private _disposed = false
  private _lastError: WritableSignal<string | null> = createSignal<string | null>(null)

  constructor() {}

  get data(): ReadonlySignal<DataChange<KLineData>> {
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

  /** 返回当前已加载数据覆盖的时间范围。 */
  get loadedTimeRange(): LoadedTimeRange | null {
    return this._store.loadedTimeRange
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

  /**
   * 设置 K 线分页请求函数。
   * @param fn 由上层协调器依赖注入的具体取数实现。
   */
  setRequestFetch(
    fn: ((spec: SymbolSpec, page: BarPageRequest) => Promise<BarPageResult>) | null,
  ): void {
    this._requestFetch = fn
  }

  /** 注册 auto 来源首次成功后的身份迁移回调。 */
  setSourceResolvedHandler(
    handler:
      | ((
          sourceId: string,
          instrument: import('../provider/types').InstrumentDescriptor,
        ) => boolean)
      | null,
  ): void {
    this._sourceResolvedHandler = handler
  }

  /** 切换当前品种，清空旧缓存并请求首个数据页。 */
  setSymbol(spec: SymbolSpec, initialStartTs?: number): void {
    this._requestVersion++
    this._currentSpec = spec
    this._store.reset()
    this._scheduler.reset()
    this._keyIndex.reset()
    this._inflightBoundary = null
    this._pendingRequestStartTs = initialStartTs ?? null
    this._initialRangePending = initialStartTs !== undefined
    this._olderData = OLDER_DATA_STATUS.UNKNOWN
    this._lastError.set(null)
    this._loadInitial()
  }

  /** 确保缓存覆盖目标左边界，必要时向前分页请求历史数据。 */
  ensureRange(requestStartTs: number, _requestEndTs: number): void {
    if (this._disposed || !this._requestFetch || !this._currentSpec) return
    if (this._currentSpec.incremental === false) return
    if (this._olderData === OLDER_DATA_STATUS.EXHAUSTED) return
    if (!this._currentSpec.source) return
    const loadedTimeRange = this._store.loadedTimeRange
    if (!loadedTimeRange) return

    if (requestStartTs >= loadedTimeRange.earliestTs) return

    // 防止重复加载
    const incrementalEnd = loadedTimeRange.earliestTs
    if (this._inflightBoundary === incrementalEnd) {
      if (this._pendingRequestStartTs === null || requestStartTs < this._pendingRequestStartTs) {
        this._pendingRequestStartTs = requestStartTs
      }
      return
    }

    this._inflightBoundary = incrementalEnd
    this._pendingRequestStartTs = requestStartTs
    this._fetchAndMerge({ limit: DEFAULT_BAR_PAGE_LIMIT, before: incrementalEnd })
  }

  /** 写入静态内联 K 线数据并取消当前请求状态。 */
  setInlineData(data: ReadonlyArray<KLineData>): void {
    if (this._disposed) return
    this._requestVersion++
    this._store.setInlineData([...data])
    this._scheduler.reset()
    this._inflightBoundary = null
    this._pendingRequestStartTs = null
    this._initialRangePending = false
    this._olderData = OLDER_DATA_STATUS.UNKNOWN
    this._lastError.set(null)
    this._keyIndex.recompute(this._store.getRawData())
  }

  /** 仅更新当前品种元数据，不重置或请求已有缓存。 */
  setCurrentSpec(spec: SymbolSpec): void {
    this._requestVersion++
    this._currentSpec = spec
  }

  /** 销毁缓存并使进行中的请求结果失效。 */
  dispose(): void {
    this._disposed = true
    this._requestVersion++
    this._scheduler.dispose()
    this._store.reset()
    this._keyIndex.reset()
    this._inflightBoundary = null
    this._pendingRequestStartTs = null
    this._initialRangePending = false
    this._olderData = OLDER_DATA_STATUS.UNKNOWN
    this._lastError.set(null)
  }

  // ── Private ──

  /** 请求当前品种的首个 K 线数据页。 */
  private _loadInitial(): void {
    if (!this._requestFetch || !this._currentSpec || this._disposed) return
    if (!this._currentSpec.source) return

    this._fetchAndMerge({ limit: DEFAULT_BAR_PAGE_LIMIT })
  }

  /** 请求一页 K 线数据，处理重试、来源解析和缓存合并。 */
  private _fetchAndMerge(page: BarPageRequest): void {
    if (!this._requestFetch || !this._currentSpec || this._disposed) return
    if (this._currentSpec.incremental === false) return

    const spec = this._currentSpec
    const requestVersion = this._requestVersion
    const requestFetch = this._requestFetch
    const disposed = (): boolean => this._disposed

    const fetchEffect = (): Promise<BarPageResult> => {
      const service: {
        readonly fetch: (
          s: SymbolSpec,
          request: BarPageRequest,
        ) => EffectType<BarPageResult, unknown>
      } = {
        fetch: (s, request) =>
          Effect.tryPromise({
            try: async () => {
              if (!s.source) {
                return Promise.reject(
                  new Error(`[DataBuffer] source is required for symbol "${s.symbol}"`),
                )
              }
              return requestFetch(s, request)
            },
            catch: (e) => e,
          }),
      }

      return pipe(
        fetchKLine(spec, page),
        Effect.provideService(KLineFetchService, service),
        Effect.runPromise,
      )
    }

    this._scheduler
      .run(async () => {
        try {
          let response: BarPageResult | undefined
          for (let attempt = 1; attempt <= FETCH_TOTAL_ATTEMPTS; attempt++) {
            try {
              response = await fetchEffect()
              break
            } catch (err) {
              if (disposed() || requestVersion !== this._requestVersion) return
              if (attempt === FETCH_TOTAL_ATTEMPTS) throw err
              this._lastError.set(`${errorMessage(err)} Retry ${attempt}/${FETCH_TOTAL_ATTEMPTS}`)
              await waitForRetry(attempt)
            }
          }
          if (response === undefined || disposed() || requestVersion !== this._requestVersion)
            return

          // 空页是合法的分页结果，不能据此推断品种没有数据或请求失败。
          this._lastError.set(null)
          if (
            response.sourceId &&
            response.instrument &&
            (spec.source === undefined || spec.source === AUTO_SOURCE_ID)
          ) {
            this._currentSpec = {
              ...spec,
              source: response.sourceId,
              instrument: response.instrument,
            }
            if (this._sourceResolvedHandler?.(response.sourceId, response.instrument) === false)
              return
          }
          this._olderData = response.olderData
          const result = this._store.merge(response.data)
          this._keyIndex.recompute(this._store.getRawData())

          this._inflightBoundary = null
          const pending = this._pendingRequestStartTs
          this._pendingRequestStartTs = null
          const loadedTimeRange = this._store.loadedTimeRange
          const initialRangePending = this._initialRangePending
          this._initialRangePending = false
          if (
            pending !== null &&
            loadedTimeRange &&
            pending < loadedTimeRange.earliestTs &&
            (initialRangePending || result.advancedEarliest)
          ) {
            this.ensureRange(pending, loadedTimeRange.earliestTs)
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
