/**
 * 币安买卖量契约。
 *
 * 数据源：`GET /api/v3/klines`。K 线元组的第 9、10 个字段分别是
 * taker buy base volume 与 taker buy quote volume（0 基索引 9、10），
 * 图表数据通路（Binance-Connector）丢弃了这两个字段，分析数据线自己取。
 *
 * 卖出量由 `volume − takerBuyBaseVolume` 得出，并用守恒断言校验。
 */

/** 支持的 K 线周期：覆盖规格要求的 1m/5m/15m/1h/4h/1d，并额外支持 30m/1w/1M。 */
export const VOLUME_INTERVALS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'] as const

/** K 线周期类型。 */
export type VolumeInterval = (typeof VOLUME_INTERVALS)[number]

/** 短周期买卖量的滚动保留天数。 */
export const VOLUME_SHORT_INTERVAL_RETENTION_DAYS = 90

/** 永久保留的周期：日线及以上不做滚动删除。 */
export const VOLUME_PERMANENT_INTERVALS: readonly VolumeInterval[] = ['1d', '1w', '1M']

/**
 * 买卖量守恒校验的相对容差。
 *
 * K 线字段是十进制字符串，转成 double 后求差再求和会产生浮点舍入噪声：
 * base 量级约 1e2 时噪声约 1e-14，quote 量级约 1e7 时一个 ULP 约 4e-9（实测最大 3.7e-9）。
 * 取相对容差 1e-12（乘总量）：覆盖浮点噪声，又远小于任何真实的拆分错误（量级至少 1e-4 相对）。
 */
export const VOLUME_SPLIT_RELATIVE_TOLERANCE = 1e-12

/** 一根 K 线的买卖量拆分。 */
export interface VolumeBar {
  /** 开盘时刻（毫秒，UTC） */
  readonly openTime: number
  /** 收盘时刻（毫秒，UTC） */
  readonly closeTime: number
  /** 基础币成交量 */
  readonly baseVolume: number
  /** 计价币成交额 */
  readonly quoteVolume: number
  /** 主动买入基础币量 */
  readonly takerBuyBaseVolume: number
  /** 主动卖出基础币量 = baseVolume − takerBuyBaseVolume */
  readonly takerSellBaseVolume: number
  /** 主动买入计价币额 */
  readonly takerBuyQuoteVolume: number
  /** 主动卖出计价币额 = quoteVolume − takerBuyQuoteVolume */
  readonly takerSellQuoteVolume: number
  /** 成交笔数 */
  readonly trades: number
}

/** 落盘的买卖量记录。 */
export interface VolumeBarRecord extends VolumeBar {
  /** 记录结构版本 */
  readonly schemaVersion: 1
  /** 交易对，例如 `BTCUSDT` */
  readonly symbol: string
  /** K 线周期 */
  readonly interval: VolumeInterval
}

/** 一次 K 线拉取请求。 */
export interface BinanceKlineRequest {
  /** 交易对 */
  readonly symbol: string
  /** 周期 */
  readonly interval: VolumeInterval
  /** 拉取根数，上限 1000 */
  readonly limit: number
}

/** K 线拉取结果。 */
export interface BinanceKlineResult {
  /** 拆分后的 K 线 */
  readonly bars: readonly VolumeBar[]
  /** 请求耗时（毫秒） */
  readonly elapsedMs: number
}

/** 币安客户端契约。 */
export interface BinanceClient {
  /**
   * 拉取指定交易对与周期的 K 线并拆分买卖量。
   *
   * @param request 交易对、周期与根数
   * @returns 拆分明细与耗时
   */
  readonly getKlines: (request: BinanceKlineRequest) => Promise<BinanceKlineResult>
}
