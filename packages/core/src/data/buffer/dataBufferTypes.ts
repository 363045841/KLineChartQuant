/** 数据缓冲层共享契约：定义已加载窗口、数据变更描述与 K 线/分时缓冲的统一接口。 */
import type { KLineData, SymbolSpec } from '../../controllers/types'
import type { ReadonlySignal } from '../../foundation/reactivity/signal'
import type { TimeShareData } from '../../foundation/types/price'
import type { InstrumentDescriptor, OlderDataStatus, TimeShareRange } from '../provider/types'

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

/** 图表自动加载使用的 K 线游标页请求。 */
export interface BarPageRequest {
  limit: number
  /** 排他上界；缺省表示从数据源最新一根开始。 */
  before?: number
}

/** K 线分页成功结果；历史状态必须由后端声明，前端不从空数组推断。 */
export interface BarPageResult {
  data: ReadonlyArray<KLineData>
  olderData: OlderDataStatus
  /** 本页实际使用的 Provider；auto 首次成功后据此锁定来源。 */
  sourceId?: string
  instrument?: InstrumentDescriptor
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
  getRawData(): KLineData[]
  setInlineData(data: ReadonlyArray<KLineData>): void
  getMonthKeys(): Int32Array | null
  getDayKeys(): Int32Array | null
  setRequestFetch(
    fn: ((spec: SymbolSpec, page: BarPageRequest) => Promise<BarPageResult>) | null,
  ): void
  setSourceResolvedHandler(
    handler: ((sourceId: string, instrument: InstrumentDescriptor) => boolean) | null,
  ): void
  setSymbol(spec: SymbolSpec, initialStartTs?: number): void
  setCurrentSpec(spec: SymbolSpec): void
  ensureRange(requestStartTs: number, requestEndTs: number): void
}

export interface TimeShareBuffer extends DataBufferLike<TimeShareData> {
  readonly range: ReadonlySignal<TimeShareRange | null>
  getRawData(): TimeShareData[]
  setInlineData(data: ReadonlyArray<TimeShareData>, preClose: number | null): void
  getRange(): TimeShareRange | null
  getPreClose(): number | null
  setRange(range: TimeShareRange): void
  setRequestFetch(fn: ((spec: SymbolSpec, date?: number) => Promise<TimeShareResult>) | null): void
  setRangeRequestFetch(
    fn: ((spec: SymbolSpec, days: number, date?: number) => Promise<TimeShareRangeResult>) | null,
  ): void
  setSourceResolvedHandler(
    handler: ((sourceId: string, instrument: InstrumentDescriptor) => boolean) | null,
  ): void
  setQueryDate(date: number): void
  getQueryDate(): number
  load(spec: SymbolSpec): void
  loadRange(spec: SymbolSpec, days: number): void
}

/** 分时请求结果：点列与昨收必须作为一个业务快照返回。 */
export interface TimeShareResult {
  data: ReadonlyArray<TimeShareData>
  preClose: number | null
  sourceId?: string
  instrument?: InstrumentDescriptor
}

/** 多日分时请求结果及 auto source 身份迁移信息。 */
export interface TimeShareRangeResult {
  range: TimeShareRange
  sourceId?: string
  instrument?: InstrumentDescriptor
}
