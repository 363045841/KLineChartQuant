/**
 * 前端主导的统一行情领域模型。
 * 数据源适配器负责把私有协议转换为这些类型，图表和 UI 不解析上游字段。
 */

import type { KLineData, TimeShareData } from '../../controllers/types'
import type { MarketSessionConfig } from '../../foundation/utils/sessionTimeLabels'
import type { DepthSource } from '../depth/depthTypes'

/** 前端可识别的品种类别；unknown 用于尚未完成语义归一化的数据源品种。 */
export type AssetClass =
  'stock' | 'index' | 'fund' | 'etf' | 'future' | 'option' | 'forex' | 'crypto' | 'unknown'

/** 图表当前支持的标准 K 线周期。 */
export type KLinePeriod =
  | '1min'
  | '5min'
  | '15min'
  | '30min'
  | '60min'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly'

/** 图表当前支持的复权方式。 */
export type KLineAdjustment = 'qfq' | 'hfq' | 'splits' | 'none'

/** K 线请求未指定时使用的默认周期。 */
export const DEFAULT_KLINE_PERIOD: KLinePeriod = 'daily'

/** K 线请求未指定时使用的默认复权方式。 */
export const DEFAULT_KLINE_ADJUSTMENT: KLineAdjustment = 'none'

/** 当前游标之前的历史数据状态；unknown 表示数据源无法可靠判断。 */
export const OLDER_DATA_STATUS = {
  AVAILABLE: 'available',
  EXHAUSTED: 'exhausted',
  UNKNOWN: 'unknown',
} as const

/** 当前游标之前的历史数据状态。 */
export type OlderDataStatus = (typeof OLDER_DATA_STATUS)[keyof typeof OLDER_DATA_STATUS]

/** 成交量数值对应的业务单位。 */
export type VolumeUnit = 'share' | 'lot' | 'contract' | 'baseAsset'

/** 品种所在交易时区的 YYYY-MM-DD 日历日。 */
export type TradingDate = `${number}-${number}-${number}`

/** 数据源私有路由引用；除对应 Provider 外其他模块不得解析。 */
export type ProviderRef = Readonly<Record<string, string | number | boolean>>

/** 单个品种支持的 K 线能力。 */
export interface BarCapability {
  periods: ReadonlyArray<KLinePeriod>
  adjustments: ReadonlyArray<KLineAdjustment>
}

/** 多日分时接口可一次查询的交易日范围。 */
export interface TimeShareRangeCapability {
  maxTradingDays: number
}

/** 单个品种可被前端启用的行情能力。 */
export interface InstrumentCapabilities {
  bars?: BarCapability
  timeShare?: boolean
  timeShareRange?: TimeShareRangeCapability
  depth?: boolean
}

/** 数据源级能力声明，用于在请求前筛选流转候选源。 */
export interface SourceCapabilities {
  assetClasses: ReadonlyArray<AssetClass>
  bars?: BarCapability
  timeShare?: boolean
  timeShareRange?: TimeShareRangeCapability
  depth?: boolean
  historyCoverage?: {
    from?: number
    to?: number
  }
}

/** 搜索、选择、加载和比较流程共用的稳定品种描述。 */
export interface InstrumentDescriptor {
  /** 数据源范围内稳定且唯一的标识。 */
  id: string
  sourceId: string
  symbol: string
  name: string
  assetClass: AssetClass
  exchange: string
  /** 对应 MarketSessionRegistry 的会话标识；纯深度品种可不提供。 */
  sessionId?: string
  currency?: string
  tickSize?: number
  lotSize?: number
  providerRef?: ProviderRef
  capabilities: InstrumentCapabilities
}

/** 数据源在聚合源管理和注册表中展示的元数据。 */
export interface DataSourceDescriptor {
  id: string
  displayName: string
  description?: string
  /** 网络 Provider 的默认 Transport 地址。 */
  defaultBaseUrl?: string
  /** Provider 可声明额外交易时段，注册前仍由前端校验。 */
  marketSessions?: Readonly<Record<string, MarketSessionConfig>>
  /** 后端或本地 Provider 声明的源级能力。 */
  capabilities?: SourceCapabilities
}

/** 数据源探测状态。 */
export type MarketDataSourceStatus = 'online' | 'offline' | 'degraded'

/** 数据源探测结果。 */
export interface SourceProbeResult {
  status: MarketDataSourceStatus
  checkedAt: number
  latencyMs?: number
  message?: string
  /** 最近一次探测得到的源级能力。 */
  capabilities?: SourceCapabilities
}

/** 品种目录搜索条件。 */
export interface InstrumentSearchQuery {
  keyword: string
  limit: number
  assetClasses?: ReadonlyArray<AssetClass>
  signal?: AbortSignal
}

/** K 线游标分页查询；before 为可选的 UTC 毫秒时间戳排他上界。 */
export interface BarQuery {
  instrument: InstrumentDescriptor
  period: KLinePeriod
  adjustment: KLineAdjustment
  limit: number
  before?: number
  signal?: AbortSignal
}

/** K 线序列及其展示所需元数据。 */
export interface BarSeries {
  instrumentId: string
  period: KLinePeriod
  adjustment: KLineAdjustment
  timezone: string
  volumeUnit?: VolumeUnit
  data: ReadonlyArray<KLineData>
  /** 后端明确声明的游标历史状态，避免前端由空数组推断。 */
  olderData: OlderDataStatus
}

/** 分时查询使用品种所在时区的 YYYY-MM-DD 交易日。 */
export interface TimeShareQuery {
  instrument: InstrumentDescriptor
  tradingDate: TradingDate
  signal?: AbortSignal
}

/** 分时序列及昨收、时区和成交量单位。 */
export interface TimeShareSeries {
  instrumentId: string
  tradingDate: TradingDate
  timezone: string
  preClose: number | null
  volumeUnit?: VolumeUnit
  data: ReadonlyArray<TimeShareData>
}

/** 单个交易日的分时点列及其独立昨收基准。 */
export interface TimeShareDay {
  tradingDate: TradingDate
  preClose: number | null
  data: ReadonlyArray<TimeShareData>
}

/** 按交易日升序排列的多日分时领域数据。 */
export interface TimeShareRange {
  instrumentId: string
  timezone: string
  requestedDays: number
  olderData: OlderDataStatus
  days: ReadonlyArray<TimeShareDay>
}

/** 品种目录能力。 */
export interface InstrumentCatalog {
  /** 按关键字和品种类别搜索当前 Provider 的品种目录。 */
  search(query: InstrumentSearchQuery): Promise<ReadonlyArray<InstrumentDescriptor>>
}

/** 历史 K 线能力。 */
export interface BarDataSource {
  /** 拉取指定品种、周期的最新一页或游标之前一页 K 线。 */
  fetch(query: BarQuery): Promise<BarSeries>
}

/** 历史或当日分时能力。 */
export interface TimeShareDataSource {
  /** 拉取指定品种在单个交易日内的分时序列。 */
  fetch(query: TimeShareQuery): Promise<TimeShareSeries>
}

/** 实时深度连接工厂。 */
export interface DepthDataSource {
  /** 为指定品种创建尚未连接的实时深度数据源。 */
  connect(instrument: InstrumentDescriptor): DepthSource
}

/** 按能力组合的数据源接口，缺失模块表示数据源不支持该能力。 */
export interface MarketDataProvider {
  readonly source: DataSourceDescriptor
  /** 探测数据源可用性并返回本次检查结果。 */
  probe(signal?: AbortSignal): Promise<SourceProbeResult>
  readonly catalog?: InstrumentCatalog
  readonly bars?: BarDataSource
  readonly timeShare?: TimeShareDataSource
  readonly depth?: DepthDataSource
}

/** 前端可稳定处理的行情错误分类。 */
export type MarketDataErrorCode =
  | 'INVALID_REQUEST'
  | 'UNSUPPORTED_CAPABILITY'
  | 'INSTRUMENT_NOT_FOUND'
  | 'UPSTREAM_UNAVAILABLE'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'INVALID_RESPONSE'
  | 'UNKNOWN'

/** Provider 抛出或返回给上层错误边界的统一错误信息。 */
export interface MarketDataFailure {
  code: MarketDataErrorCode
  message: string
  sourceId: string
  retryable: boolean
  details?: Readonly<Record<string, unknown>>
}
