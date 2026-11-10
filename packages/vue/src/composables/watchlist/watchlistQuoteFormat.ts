/** 自选报价的展示格式与涨跌方向；颜色由主题 Token 决定，不在此处硬编码。 */

import type { QuoteDirection, WatchlistQuote } from './watchlistQuote.js'

/** 无可用报价时的占位符。 */
export const QUOTE_PLACEHOLDER = '—'

/** 千分位固定按 en-US 分组，避免随运行环境切换小数分隔符。 */
const NUMBER_LOCALE = 'en-US'

const formatterCache = new Map<number, Intl.NumberFormat>()

/** 取固定小数位的分组格式器；缓存避免每帧重建 Intl 实例。 */
function decimalFormatter(decimals: number): Intl.NumberFormat {
  const cached = formatterCache.get(decimals)
  if (cached !== undefined) return cached
  const formatter = new Intl.NumberFormat(NUMBER_LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  formatterCache.set(decimals, formatter)
  return formatter
}

/**
 * 价格展示位数：跟随品种最小变动价位，缺省按两位小数。
 *
 * @param tickSize - 品种最小变动价位
 */
export function priceDecimals(tickSize: number | undefined): number {
  if (tickSize === undefined || !Number.isFinite(tickSize) || tickSize <= 0) return 2
  return Math.min(8, Math.max(0, Math.ceil(-Math.log10(tickSize))))
}

/**
 * 格式化最新价。
 *
 * @param quote - 报价
 * @param tickSize - 品种最小变动价位
 */
export function formatQuotePrice(quote: WatchlistQuote, tickSize: number | undefined): string {
  return decimalFormatter(priceDecimals(tickSize)).format(quote.last)
}

/**
 * 格式化涨跌额；与价格同精度，正数不带符号、负数带减号。
 *
 * @param quote - 报价
 * @param tickSize - 品种最小变动价位
 */
export function formatQuoteChange(quote: WatchlistQuote, tickSize: number | undefined): string {
  if (quote.prevClose <= 0) return QUOTE_PLACEHOLDER
  return decimalFormatter(priceDecimals(tickSize)).format(quote.last - quote.prevClose)
}

/**
 * 格式化涨跌幅；昨收不可用时没有可比基准，返回占位符。
 *
 * @param quote - 报价
 */
export function formatQuotePercent(quote: WatchlistQuote): string {
  if (quote.prevClose <= 0) return QUOTE_PLACEHOLDER
  const percent = ((quote.last - quote.prevClose) / quote.prevClose) * 100
  return `${decimalFormatter(2).format(percent)}%`
}

/**
 * 涨跌幅自身的方向：只按相对昨收的正负判定，与最新价的逐笔方向无关。
 *
 * @param quote - 报价
 */
export function percentDirection(quote: WatchlistQuote): QuoteDirection {
  if (quote.last > quote.prevClose) return 'up'
  if (quote.last < quote.prevClose) return 'down'
  return 'flat'
}

/**
 * 比较相邻两次展示的最新价，得到本次的涨跌方向。
 *
 * @param previous - 上一次展示的最新价
 * @param next - 本次最新价
 */
export function priceDirection(previous: number, next: number): QuoteDirection {
  if (next > previous) return 'up'
  if (next < previous) return 'down'
  return 'flat'
}
