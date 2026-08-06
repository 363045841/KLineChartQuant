import { Effect, pipe } from 'effect'
import type { Effect as EffectType } from 'effect/Effect'

import type { SymbolSpec } from '../controllers/types'
import {
  createSignal,
  type ReadonlySignal,
  type WritableSignal,
} from '../foundation/reactivity/signal'
import type { TimeShareData } from '../foundation/types/price'

import { fetchTimeShare, TimeShareFetchService } from './dataBuffer.effects'
import type { DataBufferLike, DataWindow, DataChange } from './dataBufferTypes'
import { routerTimeShareFetcher } from './router'
import type { TimeShareFetcherFn, TimeShareFetchResult } from './types'

/** 由数据管理层注入的统一 Provider 分时请求。 */
export type TimeShareRequestFetch = (
  spec: SymbolSpec,
  date?: number,
) => Promise<TimeShareFetchResult>

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message
  if (err != null && String(err).trim()) return String(err)
  return '加载失败'
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
  // 指定查询的历史日期（0 = 当天）
  private _queryDate = 0
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

  setQueryDate(date: number): void {
    this._queryDate = date
  }

  getFetcher(): TimeShareFetcherFn | null {
    return this._fetcher
  }

  getQueryDate(): number {
    return this._queryDate
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

    void Effect.runPromise(effect)
      .then((result) => {
        if (this._disposed || requestSeq !== this._requestSeq) return
        this._queryDate = 0
        this._data = [...result.data]
        this.setPreClose(result.preClose)
        this._lastError.set(null)
        this._dataSignal.set({ data: [...result.data], prependedCount: 0 })
      })
      .catch((err) => {
        if (this._disposed || requestSeq !== this._requestSeq) return
        this._lastError.set(errorMessage(err))
      })
      .finally(() => {
        if (requestSeq === this._requestSeq) {
          this._loadingSignal.set(false)
        }
      })
  }

  setInlineData(data: unknown[]): void {
    if (this._disposed) return
    this._data = data as TimeShareData[]
    this._lastError.set(null)
    this._dataSignal.set({ data: [...(data as TimeShareData[])], prependedCount: 0 })
  }

  // 销毁实例
  dispose(): void {
    this._disposed = true
    this._requestSeq++
    this._data = []
    this._preClose = null
    this._lastError.set(null)
    this._loadingSignal.set(false)
  }
}
