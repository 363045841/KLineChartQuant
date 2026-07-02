import { Effect, Fiber, pipe } from 'effect'
import type { Effect as EffectType } from 'effect/Effect'

import type { SymbolSpec } from '../controllers/types'
import { createSignal, type Signal } from '../reactivity/signal'
import type { TimeShareData } from '../types/price'

import { fetchTimeShare, TimeShareFetchService } from './dataBuffer.effects'
import type { DataBufferLike, DataWindow, DataChange } from './dataBufferTypes'
import { routerTimeShareFetcher } from './router'
import type { TimeShareFetcherFn } from './types'



export class TimeShareBuffer implements DataBufferLike {
  // 当前持有的分时数据数组（内部可变副本）
  private _data: TimeShareData[] = []
  // 向外部广播只读数据快照的信号
  private _dataSignal = createSignal<DataChange>({ data: [], prependedCount: 0 })
  // 是否正在加载中，外部 UI 绑定用
  private _loadingSignal = createSignal<boolean>(false)
  // 可选的自定义 fetcher，优先级大于默认 fectcher
  private _fetcher: TimeShareFetcherFn | null = null
  // 指定查询的历史日期（0 = 当天）
  private _queryDate = 0
  // 请求序号，每次 load() 递增
  private _requestSeq = 0
  // 当前运行的 fetch Fiber 句柄，用于随时中断旧请求
  private _fetchFiber: Fiber.RuntimeFiber<readonly TimeShareData[], unknown> | null = null
  // 实例是否已销毁，阻止后续任何操作
  private _disposed = false

  get data(): Signal<DataChange> {
    return this._dataSignal
  }

  get loading(): Signal<boolean> {
    return this._loadingSignal
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

  setQueryDate(date: number): void {
    this._queryDate = date
  }

  getFetcher(): TimeShareFetcherFn | null {
    return this._fetcher
  }

  getQueryDate(): number {
    return this._queryDate
  }

  load(spec: SymbolSpec): void {
    if (this._disposed) return

    if (this._fetchFiber) {
      Fiber.interrupt(this._fetchFiber)
      this._fetchFiber = null
    }

    const requestSeq = ++this._requestSeq
    this._loadingSignal.set(true)

    const timeShareService: {
      readonly fetch: (
        s: SymbolSpec,
        date?: number,
      ) => EffectType<ReadonlyArray<TimeShareData>, unknown>
    } = {
      fetch: (s, date) =>
        Effect.tryPromise(() => {
          const fetcher = this._fetcher ?? routerTimeShareFetcher
          return fetcher(s.source ?? 'gotdx', {
            symbol: s.symbol,
            exchange: s.exchange,
            date,
          })
        }),
    }

    const effect = pipe(
      fetchTimeShare(spec, this._queryDate || undefined),
      Effect.provideService(TimeShareFetchService, timeShareService),
      Effect.tap((data) =>
        Effect.sync(() => {
          if (this._disposed) return
          this._queryDate = 0
          this._data = [...data]
          this._dataSignal.set({ data: [...data], prependedCount: 0 })
        }),
      ),
      Effect.ensuring(
        Effect.sync(() => {
          if (requestSeq === this._requestSeq) {
            this._loadingSignal.set(false)
          }
        }),
      ),
    )

    this._fetchFiber = Effect.runFork(effect)
  }

  setInlineData(data: unknown[]): void {
    if (this._disposed) return
    this._data = data as TimeShareData[]
    this._dataSignal.set({ data: [...(data as TimeShareData[])], prependedCount: 0 })
  }

  // 销毁实例
  dispose(): void {
    this._disposed = true
    this._requestSeq++
    if (this._fetchFiber) {
      Fiber.interrupt(this._fetchFiber)
      this._fetchFiber = null
    }
    this._data = []
    this._loadingSignal.set(false)
  }
}
