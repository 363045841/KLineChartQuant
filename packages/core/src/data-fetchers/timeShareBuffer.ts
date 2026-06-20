import { createSignal, type Signal } from '../reactivity/signal'
import type { SymbolSpec } from '../controllers/types'
import type { TimeShareData } from '../types/price'
import type { TimeShareFetcherFn } from './types'
import type { DataBufferLike } from './dataBufferTypes'
import type { DataWindow } from './dataBuffer'
import { routerTimeShareFetcher } from './router'

export class TimeShareBuffer implements DataBufferLike {
  private _data: TimeShareData[] = []
  private _dataSignal = createSignal<ReadonlyArray<TimeShareData>>([])
  private _loadingSignal = createSignal<boolean>(false)
  private _fetcher: TimeShareFetcherFn | null = null
  private _queryDate = 0
  private _requestSeq = 0
  private _disposed = false

  get data(): Signal<ReadonlyArray<unknown>> {
    return this._dataSignal as Signal<ReadonlyArray<unknown>>
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

  async load(spec: SymbolSpec): Promise<void> {
    if (this._disposed) return
    const fetcher = this._fetcher ?? routerTimeShareFetcher
    const requestSeq = ++this._requestSeq
    this._loadingSignal.set(true)

    try {
      const data = await fetcher(spec.source ?? 'gotdx', {
        symbol: spec.symbol,
        exchange: spec.exchange,
        date: this._queryDate || undefined,
      })
      this._queryDate = 0

      if (requestSeq !== this._requestSeq) return
      if (this._disposed) return

      this._data = [...data]
      this._dataSignal.set([...data])
    } finally {
      if (requestSeq === this._requestSeq) {
        this._loadingSignal.set(false)
      }
    }
  }

  setInlineData(data: unknown[]): void {
    if (this._disposed) return
    this._data = data as TimeShareData[]
    this._dataSignal.set([...(data as TimeShareData[])])
  }

  dispose(): void {
    this._disposed = true
    this._requestSeq++
    this._data = []
    this._loadingSignal.set(false)
  }
}