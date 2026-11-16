/**
 * 期权品种注册表：哪个标的在哪个场所有期权。
 *
 * 一个品种只登记一个主场所：BTC/ETH 在 Deribit（链最深），SOL/BNB/XRP 在 Binance
 * （Deribit 没有它们的期权）。ADA 等没有期权场所的品种不登记，面板按「没有期权数据」处理。
 * 数据目录用统一标的代码、不加场所前缀：一个品种只有一份序列，场所随行落盘。
 */

/** 期权数据的场所。 */
export type OptionVenue = 'deribit' | 'binance'

/** 一个可采标的的注册项。 */
export interface OptionMarket {
  /** 统一标的代码，也是数据目录名 */
  readonly symbol: string
  /** 场所 */
  readonly venue: OptionVenue
  /** 场内写法：Deribit 用 BTC，Binance 用 SOLUSDT */
  readonly venueSymbol: string
  /** 展示用场所名 */
  readonly venueName: string
}

/**
 * 可采标的清单。
 *
 * 顺序即命令行与采集器的默认顺序；新增品种只改这里一处，统计、滚上、保留期与面板
 * 都按统一标的代码工作，不需要各自维护名单。
 */
export const OPTION_MARKETS = [
  { symbol: 'BTC', venue: 'deribit', venueSymbol: 'BTC', venueName: 'Deribit' },
  { symbol: 'ETH', venue: 'deribit', venueSymbol: 'ETH', venueName: 'Deribit' },
  { symbol: 'SOL', venue: 'binance', venueSymbol: 'SOLUSDT', venueName: 'Binance' },
  { symbol: 'BNB', venue: 'binance', venueSymbol: 'BNBUSDT', venueName: 'Binance' },
  { symbol: 'XRP', venue: 'binance', venueSymbol: 'XRPUSDT', venueName: 'Binance' },
] as const satisfies readonly OptionMarket[]

/** 支持的期权标的：由注册表推导，新增品种不用改类型。 */
export type OptionCurrency = (typeof OPTION_MARKETS)[number]['symbol']

/** 全部可采标的，供命令行默认值与校验使用。 */
export const OPTION_CURRENCIES: readonly OptionCurrency[] = OPTION_MARKETS.map(
  (market) => market.symbol,
)

/**
 * 按统一标的代码查注册项。
 *
 * @param symbol 标的代码，大小写不敏感
 * @returns 注册项；没有登记时返回 null
 */
export function optionMarketOf(symbol: string): OptionMarket | null {
  const code = symbol.trim().toUpperCase()
  for (const market of OPTION_MARKETS) {
    if (market.symbol === code) return market
  }
  return null
}
