/** 数据缓冲层共享契约：定义已加载窗口、数据变更描述与 K 线/分时缓冲的统一接口。 */
import type { KLineData, SymbolSpec, DataFetcher } from '../../controllers/types'
import type { ReadonlySignal } from '../../foundation/reactivity/signal'
import type { TimeShareData } from '../../foundation/types/price'

import type { TimeShareFetcherFn } from '../legacy/types'

export interface DataWindow {
  earliestTs: number
  latestTs: number
}

/** 数据变更描述：在一次数据更新中携带数据本身和变更元数据 */
export interface DataChange {
  readonly data: ReadonlyArray<unknown>
  /** 本次新增了多少根 K 线到头部（向左滚动加载的历史数据） */
  readonly prependedCount: number
}

export interface DataBufferLike {
  readonly data: ReadonlySignal<DataChange>
  readonly loading: ReadonlySignal<boolean>
  /** 最近一次显式拉取失败的可读原因；成功或重置后为 null */
  readonly lastError: ReadonlySignal<string | null>
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
}

export interface TimeShareBuffer extends DataBufferLike {
  getRawData(): TimeShareData[]
  setFetcher(fetcher: TimeShareFetcherFn | null): void
  setQueryDate(date: number): void
  getFetcher(): TimeShareFetcherFn | null
  getQueryDate(): number
  load(spec: SymbolSpec): void
}
