/**
 * 行情服务契约：图表、计算与警报共用的唯一取数入口。
 *
 * 只有本模块可以查询 Provider、订阅实时流并合并历史；调用方只读取序列，
 * 不再各自维护缓存、分页或实时补偿。
 */
import type { SymbolSpec } from '@/controllers/types.js'
import type { ReadonlySignal } from '@/foundation/reactivity/signal.js'
import type { KLineData, TimeShareData } from '@/foundation/types/price.js'
import type {
  BarsCacheQuery,
  BarsCacheResult,
  BarsWindowCacheQuery,
  BarsWindowCacheResult,
  CoverageResult,
  DataChange,
  LoadedTimeRange,
  MarketDataCacheStats,
  TimeShareCacheQuery,
  TimeShareCacheResult,
  TimeShareRangeCacheQuery,
  TimeShareRangeCacheResult,
} from '../buffer/types.js'
import type {
  BarAggregation,
  InstrumentDescriptor,
  KLineAdjustment,
  KLinePeriod,
  OlderDataStatus,
  SourceCapabilities,
  TimeShareRange,
  TradingDate,
} from '../provider/types.js'
import type { TradeRange, TradeSnapshot } from '../trades/types.js'

/** K 线序列的取数参数；周期与复权由 spec 携带，这里只声明序列差异。 */
export interface BarsOptions {
  /** 合并周期；不合并也显式传入原始聚合值。 */
  readonly aggregation: BarAggregation
  /** 首批至少加载多少根；调用方按自己的展示需求决定。 */
  readonly initialBars: number
}

/** K 线序列只读视图；生产写入能力不暴露给消费者。 */
export interface BarsSeries {
  readonly data: ReadonlySignal<DataChange<KLineData>>
  readonly loading: ReadonlySignal<boolean>
  readonly lastError: ReadonlySignal<string | null>
  readonly loadedTimeRange: LoadedTimeRange | null
  readonly olderData: OlderDataStatus
  readonly timezone: string | null
  /** 实际解析到的品种；首屏返回前等于请求品种。 */
  readonly instrument: InstrumentDescriptor
  /** 数据源声明的能力；用于脚本时间与成交流判断。 */
  readonly capabilities: SourceCapabilities | null
  /** 最后一根是否已经收盘；实时尾巴据此判断。 */
  readonly lastBarClosed: ReadonlySignal<boolean>
  getRawData(): readonly KLineData[]
  /** 向前补一页；返回本次是否真正推进、或数据源已耗尽。 */
  loadOlder(limit: number): Promise<CoverageResult>
  /** 释放一个使用者；最后一个使用者离开时才销毁序列。 */
  dispose(): void
}

/** 分时序列参数；单日与多日共用同一条加载路径。 */
export interface TimeShareOptions {
  /** 交易日数量；单日传 1。 */
  readonly days: number
  /** 截止交易日；缺省表示最新交易日。 */
  readonly tradingDate?: TradingDate
}

/** 分时序列只读视图。 */
export interface TimeShareSeries {
  readonly data: ReadonlySignal<DataChange<TimeShareData>>
  readonly loading: ReadonlySignal<boolean>
  readonly lastError: ReadonlySignal<string | null>
  readonly range: ReadonlySignal<TimeShareRange | null>
  getRawData(): readonly TimeShareData[]
  getPreClose(): number | null
  dispose(): void
}

/** 逐笔成交序列；历史按区间补，实时帧与历史共用同一份缓冲。 */
export interface TradesSeries {
  readonly snapshot: ReadonlySignal<TradeSnapshot>
  load(range: TradeRange): Promise<void>
  dispose(): void
}

/** 一次性读取一页历史；供脚本计算等只读消费者使用。 */
export interface BarsPageRequest {
  readonly spec: SymbolSpec
  readonly aggregation: BarAggregation
  readonly limit: number
  /** 排他上界；缺省从最新一根开始。 */
  readonly beforeTimestamp?: number
  readonly signal?: AbortSignal
}

/** 按来源与代码读取一页；跨品种脚本请求没有现成描述符时使用。 */
export interface BarsSymbolRequest {
  readonly source: string
  readonly symbol: string
  readonly period: KLinePeriod
  readonly adjustment: KLineAdjustment
  readonly aggregation: BarAggregation
  readonly limit: number
  readonly beforeTimestamp?: number
  readonly signal?: AbortSignal
}

/** 一页历史的结果；只含调用方需要的字段。 */
export interface BarsPage {
  readonly instrument: InstrumentDescriptor
  readonly data: readonly KLineData[]
  readonly older: OlderDataStatus
  readonly timezone: string
}

/** 行情服务唯一入口。 */
export interface MarketDataService {
  /** 订阅 K 线序列；同一序列的多个使用者共享一份数据与一条连接。 */
  bars(spec: SymbolSpec, options: BarsOptions): BarsSeries
  /** 订阅分时序列；分时不建立实时连接。 */
  timeShare(spec: SymbolSpec, options: TimeShareOptions): TimeShareSeries
  /** 订阅逐笔成交序列。 */
  trades(spec: SymbolSpec): TradesSeries
  /** 读取一页历史，不建立订阅。 */
  read(request: BarsPageRequest): Promise<BarsPage>
  /** 按来源与代码读取一页，不建立订阅。 */
  readSymbol(request: BarsSymbolRequest): Promise<BarsPage>
  /** 按日期窗口查询；向前翻页与截断由服务处理。 */
  queryBarsWindow(query: BarsWindowCacheQuery): Promise<BarsWindowCacheResult>
  /** 查询一页 K 线；命中缓存直接返回。 */
  queryBars(query: BarsCacheQuery): Promise<BarsCacheResult>
  /** 查询单个交易日分时。 */
  queryTimeShare(query: TimeShareCacheQuery): Promise<TimeShareCacheResult>
  /** 查询多日分时。 */
  queryTimeShareRange(query: TimeShareRangeCacheQuery): Promise<TimeShareRangeCacheResult>
  /** 清空全部缓存并取消在途请求。 */
  clear(): void
  /** 共享缓存的近似内存用量。 */
  readonly stats: ReadonlySignal<MarketDataCacheStats>
  setMaxBytes(maxBytes: number): void
  dispose(): void
}
