/**
 * 行情协议契约：前端唯一的数据接入层定义
 * DTO 与 Transport 接口集中于此，后端只要支持该契约即可接入数据
 * OpenAPI 文档为派生物，以本接口为唯一权威
 */
import type {
  AssetClass,
  KLineAdjustment,
  KLinePeriod,
  MarketDataErrorCode,
  OlderDataStatus,
  ProviderRef,
  TradingDate,
  VolumeUnit,
} from '../types'
import type { SourceCapabilities } from '../types'

// 协议名称
export const V1_PROTOCOL_NAME = 'market-data-v1' as const
// 协议版本
export const V1_PROTOCOL_VERSION = 1 as const

// 成功 envelope：服务端对每次请求包装的通用外壳
export interface ProtocolEnvelope<T> {
  data: T
  requestId: string
}

// 错误 envelope：请求失败时返回统一错误结构
export interface ProtocolErrorEnvelope {
  error: { code: ProtocolErrorCode; message: string; details?: Readonly<Record<string, unknown>> }
  requestId: string
}

// V1 后端可返回的错误码；INTERNAL 保留给尚未完成领域错误映射的服务
export type ProtocolErrorCode = MarketDataErrorCode | 'INTERNAL'

// 源明确无法完成请求时的确定性错误码；触发请求流转
export const V1_SOURCE_REJECTION_CODES = [
  'UNSUPPORTED_CAPABILITY',
  'INSTRUMENT_NOT_FOUND',
] as const satisfies ReadonlyArray<ProtocolErrorCode>

export type ProtocolSourceRejectionCode = (typeof V1_SOURCE_REJECTION_CODES)[number]

// 数据源已知的历史数据粗粒度覆盖区间，UTC Unix 毫秒；具体品种可用范围可能更窄
export interface ProtocolHistoryCoverage {
  from?: number
  to?: number
}

// 数据源级能力声明，用于请求流转前筛选候选源
export type ProtocolSourceCapabilities = SourceCapabilities

// 数据源探测结果
export interface ProtocolSourceProbe {
  status: 'online' | 'offline' | 'degraded' // 在线/离线/降级
  checkedAt: number
  latencyMs?: number
  message?: string
  capabilities?: ProtocolSourceCapabilities
}

// 品种支持的 K 线能力
export interface ProtocolBarCapability {
  periods: ReadonlyArray<KLinePeriod> // K线周期级别
  adjustments: ReadonlyArray<KLineAdjustment> // 复权
}

// 品种可被前端启用的行情能力
export interface ProtocolInstrumentCapabilities {
  bars?: ProtocolBarCapability
  timeShare?: boolean
  timeShareRange?: ProtocolTimeShareRangeCapability
  depth?: boolean // 实时深度（订单簿/盘口 L2），预留
}

// 多日分时接口可一次查询的交易日上限
export interface ProtocolTimeShareRangeCapability {
  maxTradingDays: number
}

// 品种描述：搜索目录与请求体共用的稳定品种信息
export interface ProtocolInstrumentDescriptor {
  id: string // 品种唯一标识
  sourceId: string // 所属数据源 ID
  symbol: string // 品种代码
  name: string // 品种名称
  assetClass: AssetClass // 品种类别
  exchange: string // 交易所标识
  sessionId?: string // 交易时段标识
  currency?: string // 计价货币
  tickSize?: number // 最小报价单位
  lotSize?: number // 最小交易手数
  providerRef?: ProviderRef // 数据源私有路由引用
  capabilities: ProtocolInstrumentCapabilities // 可被前端启用的行情能力
}

/**
 * 请求体中的品种身份引用：相比目录描述只带定位品种所需的最小字段集
 * 后端凭 id 直接获取行情，无需再次搜索品种目录
 * providerRef 为数据源私有路由参数，客户端只原样带回、不得解析
 */
export interface ProtocolInstrumentReference {
  id: string // 数据源范围内稳定且唯一的品种标识
  symbol: string // 品种代码
  exchange: string // 交易所标识
  providerRef?: ProviderRef // 数据源私有路由参数，仅原样带回，不得解析
}

// 品种目录搜索请求
export interface ProtocolInstrumentSearchRequest {
  sourceId: string
  keyword: string
  limit: number
  assetClasses?: ReadonlyArray<AssetClass>
}

// 品种目录搜索结果
export interface ProtocolInstrumentSearchResult {
  items: ReadonlyArray<ProtocolInstrumentDescriptor>
}

// K 线请求：before 为可选的 UTC Unix 毫秒排他游标，不传时返回最新一页
export interface ProtocolBarRequest {
  sourceId: string
  instrument: ProtocolInstrumentReference
  period: KLinePeriod
  adjustment: KLineAdjustment
  limit: number
  before?: number
}

// K 线条目
export interface ProtocolKLineItem {
  timestamp: number
  date?: string
  open: number
  high: number
  low: number
  close: number
  volume?: number
  turnover?: number
  amplitude?: number
  changePercent?: number
  changeAmount?: number
  turnoverRate?: number
}

// K 线序列
export interface ProtocolBarSeries {
  instrumentId: string
  period: KLinePeriod
  adjustment: KLineAdjustment
  timezone: string
  volumeUnit?: VolumeUnit
  items: ReadonlyArray<ProtocolKLineItem>
  /** 当前游标之前是否还有可继续加载的历史数据。 */
  olderData: OlderDataStatus
}

// 分时请求：tradingDate 为品种时区内的 YYYY-MM-DD 交易日
export interface ProtocolTimeShareRequest {
  sourceId: string
  instrument: ProtocolInstrumentReference
  tradingDate: TradingDate
}

// 分时条目
export interface ProtocolTimeShareItem {
  timestamp: number
  price: number
  average: number
  volume?: number
  amount?: number
}

// 分时序列
export interface ProtocolTimeShareSeries {
  instrumentId: string
  tradingDate: TradingDate
  timezone: string
  preClose: number | null
  volumeUnit?: VolumeUnit
  items: ReadonlyArray<ProtocolTimeShareItem>
}

// 多日分时请求：endTradingDate 包含在结果内，days 按实际交易日计数
export interface ProtocolTimeShareRangeRequest {
  sourceId: string
  instrument: ProtocolInstrumentReference
  endTradingDate: TradingDate
  days: number
}

// 多日分时中的单个交易日；每天独立保留涨跌基准
export interface ProtocolTimeShareDay {
  tradingDate: TradingDate
  preClose: number | null
  items: ReadonlyArray<ProtocolTimeShareItem>
}

// 多日分时序列；days 按交易日升序排列
export interface ProtocolTimeShareRangeSeries {
  instrumentId: string
  timezone: string
  requestedDays: number
  days: ReadonlyArray<ProtocolTimeShareDay>
  olderData: OlderDataStatus
}

/**
 * 协议传输接口：实现负责 wire 语义（URL、envelope 解包、错误解析）
 * 返回统一解包后的 data 载荷，不掺领域映射逻辑
 */
export interface MarketDataTransport {
  // 探测指定数据源可用性
  probe(sourceId: string, signal?: AbortSignal): Promise<ProtocolSourceProbe>
  // 搜索数据源内的标准品种目录
  searchInstruments(
    request: ProtocolInstrumentSearchRequest,
    signal?: AbortSignal,
  ): Promise<ProtocolInstrumentSearchResult>
  // 拉取指定品种、周期的游标分页 K 线
  fetchBars(request: ProtocolBarRequest, signal?: AbortSignal): Promise<ProtocolBarSeries>
  // 拉取指定品种在单个交易日内的分时序列
  fetchTimeShare(
    request: ProtocolTimeShareRequest,
    signal?: AbortSignal,
  ): Promise<ProtocolTimeShareSeries>
  // 拉取截止交易日前若干个实际交易日的分时序列
  fetchTimeShareRange?(
    request: ProtocolTimeShareRangeRequest,
    signal?: AbortSignal,
  ): Promise<ProtocolTimeShareRangeSeries>
}
