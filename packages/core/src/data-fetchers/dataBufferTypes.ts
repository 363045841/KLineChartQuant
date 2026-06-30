import type { Signal } from '../reactivity/signal'
import type { KLineData, SymbolSpec, DataFetcher } from '../controllers/types'
import type { TimeShareData } from '../types/price'
import type { TimeShareFetcherFn } from './types'

export interface DataWindow {
  earliestTs: number
  latestTs: number
}

export interface DataBufferLike {
  readonly data: Signal<ReadonlyArray<unknown>>
  readonly loading: Signal<boolean>
  readonly loadedWindow: DataWindow | null
  getRawData(): unknown[]
  setInlineData(data: unknown[]): void
  dispose(): void
}

export interface KLineBuffer extends DataBufferLike {
  readonly currentSpec: SymbolSpec | null
  getRawData(): KLineData[]
  getMonthKeys(): Int32Array | null
  getDayKeys(): Int32Array | null
  setFetcher(fetcher: DataFetcher | null): void
  setRequestFetch(
    fn:
      | ((spec: SymbolSpec, startTs: number, endTs: number) => Promise<ReadonlyArray<KLineData>>)
      | null,
  ): void
  setSymbol(spec: SymbolSpec, initialStartTs?: number): void
  setCurrentSpec(spec: SymbolSpec): void
  ensureRange(requestStartTs: number, requestEndTs: number): void
  readonly prepend: Signal<number>
}

export interface TimeShareBuffer extends DataBufferLike {
  getRawData(): TimeShareData[]
  setFetcher(fetcher: TimeShareFetcherFn | null): void
  setQueryDate(date: number): void
  getFetcher(): TimeShareFetcherFn | null
  getQueryDate(): number
  load(spec: SymbolSpec): void
}
