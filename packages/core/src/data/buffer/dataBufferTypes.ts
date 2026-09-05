/** 数据缓冲层共享契约：定义已加载窗口、数据变更描述与 K 线/分时缓冲的统一接口。 */
import type { KLineData, SymbolSpec } from '../../controllers/types'
import type { ReadonlySignal } from '../../foundation/reactivity/signal'
import type { TimeShareData } from '../../foundation/types/price'
import type { OlderDataStatus, TimeShareRange } from '../provider/types'

/** 已加载行情数据覆盖的时间范围。 */
export interface LoadedTimeRange {
  earliestTs: number
  latestTs: number
}
/** 数据变更描述：在一次数据更新中携带数据本身和变更元数据 */
export interface DataChange<T> {
  readonly data: ReadonlyArray<T>
  /** 本次新增了多少根 K 线到头部（向左滚动加载的历史数据） */
  readonly prependedCount: number
}

export interface DataBufferLike<T = KLineData | TimeShareData> {
  readonly data: ReadonlySignal<DataChange<T>>
  readonly loading: ReadonlySignal<boolean>
  /** 最近一次显式拉取失败的可读原因；成功或重置后为 null */
  readonly lastError: ReadonlySignal<string | null>
  /** 当前已加载数据覆盖的时间范围。 */
  readonly loadedTimeRange: LoadedTimeRange | null
  getRawData(): T[]
  dispose(): void
}

export interface KLineBuffer extends DataBufferLike<KLineData> {
  readonly currentSpec: SymbolSpec | null
  /** 服务端返回的当前 K 线序列时区。 */
  readonly timezone: string | null
  getRawData(): KLineData[]
  /** 按唯一时间戳解析当前快照中的逻辑索引；不存在或重复时返回 null。 */
  getLogicalIndexAtTimestamp(timestamp: number): number | null
  setInlineData(data: ReadonlyArray<KLineData>): void
  /** 缓存查询开始时发布加载状态。 */
  setLoading(loading: boolean): void
  /** 缓存查询失败时发布错误状态。 */
  setError(error: string | null): void
  /** 合并缓存查询结果并保留前置插入信息。 */
  mergeData(data: ReadonlyArray<KLineData>, olderData: OlderDataStatus, timezone: string): void
  getMonthKeys(): Int32Array | null
  getDayKeys(): Int32Array | null
  setSymbol(spec: SymbolSpec): void
  setCurrentSpec(spec: SymbolSpec): void
}

export interface TimeShareBuffer extends DataBufferLike<TimeShareData> {
  readonly range: ReadonlySignal<TimeShareRange | null>
  getRawData(): TimeShareData[]
  /** 按唯一时间戳解析当前快照中的逻辑索引；不存在或重复时返回 null。 */
  getLogicalIndexAtTimestamp(timestamp: number): number | null
  setInlineData(data: ReadonlyArray<TimeShareData>, preClose: number | null): void
  getRange(): TimeShareRange | null
  getPreClose(): number | null
  setRange(range: TimeShareRange): void
  /** 缓存查询开始或结束时发布加载状态。 */
  setLoading(loading: boolean): void
  /** 缓存查询失败时发布错误状态。 */
  setError(error: string | null): void
  setQueryDate(date: number): void
  getQueryDate(): number
}
