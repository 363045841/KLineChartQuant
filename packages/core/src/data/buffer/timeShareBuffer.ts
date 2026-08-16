/** 分时数据缓冲：按交易日拉取并缓存分时点列，管理昨收元数据与加载/错误状态。 */
import { Effect, pipe } from 'effect'
import type { Effect as EffectType } from 'effect/Effect'

import type { SymbolSpec } from '../../controllers/types'
import {
  createSignal,
  type ReadonlySignal,
  type WritableSignal,
} from '../../foundation/reactivity/signal'
import type { TimeShareData } from '../../foundation/types/price'

import {
  FETCH_TOTAL_ATTEMPTS,
  fetchTimeShare,
  retryBackoffMs,
  TimeShareFetchService,
} from './dataBuffer.effects'
import type { DataBufferLike, DataWindow, DataChange } from './dataBufferTypes'
import { routerTimeShareFetcher } from '../legacy/router'
import type {
  TimeShareDayFetchResult,
  TimeShareFetcherFn,
  TimeShareFetchResult,
  TimeShareRangeFetchResult,
} from '../legacy/types'

/** 由数据管理层注入的统一 Provider 分时请求。 */
export type TimeShareRequestFetch = (
  spec: SymbolSpec,
  date?: number,
) => Promise<TimeShareFetchResult>

/** 多日分时请求由数据管理层注入，旧 Fetcher 不支持该能力。 */
export type TimeShareRangeRequestFetch = (
  spec: SymbolSpec,
  date: number | undefined,
  days: number,
) => Promise<TimeShareRangeFetchResult>

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message
  if (err != null && String(err).trim()) return String(err)
  return '加载失败'
}

// 按当前重试次数等待退避时间，避免请求连续打满上游。
function waitForRetry(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, retryBackoffMs(attempt)))
}

export class TimeShareBuffer implements DataBufferLike {
  // 当前持有的分时数据数组（内部可变副本）
  private _data: TimeShareData[] = []
  // 向外部广播只读数据快照的信号
  private _dataSignal: WritableSignal<DataChange> = createSignal<DataChange>({
    data: [],
    prependedCount: 0,
  })
  // 是否正在加载中，外部 UI 绑定用
  private _loadingSignal: WritableSignal<boolean> = createSignal<boolean>(false)
  private _lastError: WritableSignal<string | null> = createSignal<string | null>(null)
  // 可选的自定义 fetcher，优先级大于默认 fetcher
  private _fetcher: TimeShareFetcherFn | null = null
  private _requestFetch: TimeShareRequestFetch | null = null
  private _rangeRequestFetch: TimeShareRangeRequestFetch | null = null
  // 指定查询的历史日期（0 = 当天）
  private _queryDate = 0
  // 查询的实际交易日数量；1 保持原有单日分时路径
  private _queryDays = 1
  // 多日分时按交易日分组保存，供后续按日百分比和槽位布局读取
  private _days: TimeShareDayFetchResult[] = []
  // 昨收价（分时涨跌基准）；未设置时为 null
  private _preClose: number | null = null
  // 请求序号，每次 load() 递增；过期结果丢弃
  private _requestSeq = 0
  // 实例是否已销毁，阻止后续任何操作
  private _disposed = false

  get data(): ReadonlySignal<DataChange> {
    return this._dataSignal
  }

  get loading(): ReadonlySignal<boolean> {
    return this._loadingSignal
  }

  get lastError(): ReadonlySignal<string | null> {
    return this._lastError
  }

  get loadedWindow(): DataWindow | null {
    if (this._data.length === 0) return null
    return {
      earliestTs: this._data[0]!.timestamp,
      latestTs: this._data[this._data.length - 1]!.timestamp,
    }
  }

  getRawData(): TimeShareData[] {
    return this._data
  }

  setFetcher(fetcher: TimeShareFetcherFn | null): void {
    this._fetcher = fetcher
  }

  /** 设置优先于旧 Fetcher 的统一 Provider 分时请求。 */
  setRequestFetch(fetcher: TimeShareRequestFetch | null): void {
    this._requestFetch = fetcher
  }

  /** 设置多日分时请求；缺失时仅允许单日分时。 */
  setRangeRequestFetch(fetcher: TimeShareRangeRequestFetch | null): void {
    this._rangeRequestFetch = fetcher
  }

  setQueryDate(date: number): void {
    this._queryDate = date
  }

  /** 设置查询的实际交易日数量，非法输入归一化为单日。 */
  setQueryDays(days: number): void {
    this._queryDays = Number.isFinite(days) ? Math.max(1, Math.floor(days)) : 1
  }

  getFetcher(): TimeShareFetcherFn | null {
    return this._fetcher
  }

  getQueryDate(): number {
    return this._queryDate
  }

  /** 返回当前查询的实际交易日数量。 */
  getQueryDays(): number {
    return this._queryDays
  }

  /** 返回多日分时按交易日分组的数据快照。 */
  getDays(): ReadonlyArray<TimeShareDayFetchResult> {
    return this._days
  }

  getPreClose(): number | null {
    return this._preClose
  }

  setPreClose(preClose: number | null): void {
    if (preClose === null || (Number.isFinite(preClose) && preClose > 0)) {
      this._preClose = preClose
    }
  }

  load(spec: SymbolSpec): void {
    if (this._disposed) return

    const requestSeq = ++this._requestSeq
    // 新请求开始即清空旧点、昨收与错误，避免历史日期切换时短暂显示另一天数据
    this._data = []
    this._days = []
    this._preClose = null
    this._lastError.set(null)
    this._dataSignal.set({ data: [], prependedCount: 0 })
    this._loadingSignal.set(true)

    const timeShareService: {
      readonly fetch: (s: SymbolSpec, date?: number) => EffectType<TimeShareFetchResult, unknown>
    } = {
      fetch: (s, date) =>
        Effect.tryPromise({
          try: () => {
            if (this._requestFetch) return this._requestFetch(s, date)
            const fetcher = this._fetcher ?? routerTimeShareFetcher
            return fetcher(s.source ?? 'gotdx', {
              symbol: s.symbol,
              exchange: s.exchange,
              params: s.params,
              date,
            }).then((result) => {
              if (Array.isArray(result)) {
                return { data: result, preClose: null }
              }
              return result as TimeShareFetchResult
            })
          },
          catch: (error) => (error instanceof Error ? error : new Error(String(error))),
        }),
    }

    const effect = pipe(
      fetchTimeShare(spec, this._queryDate || undefined),
      Effect.provideService(TimeShareFetchService, timeShareService),
    )

    void (async () => {
      try {
        let result: TimeShareFetchResult | TimeShareRangeFetchResult | undefined
        for (let attempt = 1; attempt <= FETCH_TOTAL_ATTEMPTS; attempt++) {
          try {
            if (this._queryDays === 1) {
              result = await Effect.runPromise(effect)
            } else {
              if (!this._rangeRequestFetch) {
                throw new Error('当前数据源不支持多日分时')
              }
              result = await this._rangeRequestFetch(
                spec,
                this._queryDate || undefined,
                this._queryDays,
              )
            }
            break
          } catch (err) {
            if (this._disposed || requestSeq !== this._requestSeq) return
            if (attempt === FETCH_TOTAL_ATTEMPTS) throw err
            this._lastError.set(`${errorMessage(err)} Retry ${attempt}/${FETCH_TOTAL_ATTEMPTS}`)
            await waitForRetry(attempt)
          }
        }
        if (!result || this._disposed || requestSeq !== this._requestSeq) return
        this._queryDate = 0
        if ('days' in result) {
          this._days = result.days.map((day) => ({
            tradingDate: day.tradingDate,
            preClose: day.preClose,
            data: [...day.data],
          }))
          this._data = this._days.flatMap((day) => day.data)
          this.setPreClose(this._days[this._days.length - 1]?.preClose ?? null)
        } else {
          this._days = []
          this._data = [...result.data]
          this.setPreClose(result.preClose)
        }
        this._lastError.set(null)
        this._dataSignal.set({ data: [...this._data], prependedCount: 0 })
      } catch (err) {
        if (this._disposed || requestSeq !== this._requestSeq) return
        this._lastError.set(errorMessage(err))
      } finally {
        if (requestSeq === this._requestSeq) {
          this._loadingSignal.set(false)
        }
      }
    })()
  }

  setInlineData(data: unknown[]): void {
    if (this._disposed) return
    this._data = data as TimeShareData[]
    this._days = []
    this._lastError.set(null)
    this._dataSignal.set({ data: [...(data as TimeShareData[])], prependedCount: 0 })
  }

  // 销毁实例
  dispose(): void {
    this._disposed = true
    this._requestSeq++
    this._data = []
    this._days = []
    this._preClose = null
    this._lastError.set(null)
    this._loadingSignal.set(false)
  }
}
