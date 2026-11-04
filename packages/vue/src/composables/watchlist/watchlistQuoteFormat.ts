/** 自选报价的展示格式与涨跌方向；颜色由主题 Token 决定，不在此处硬编码。 */

import type { WatchlistQuote } from './useWatchlistQuotes.js'

/** 无可用报价时的占位符。 */
export const QUOTE_PLACEHOLDER = '—'

/** 涨跌方向；与主题的 positive / negative / neutral 语义一一对应。 */
export type QuoteDirection = 'up' | 'down' | 'flat'

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
  return quote.last.toFixed(priceDecimals(tickSize))
}

/**
 * 格式化涨跌幅；昨收不可用时没有可比基准，返回占位符。
 *
 * @param quote - 报价
 */
export function formatQuoteChange(quote: WatchlistQuote): string {
  if (quote.prevClose <= 0) return QUOTE_PLACEHOLDER
  const percent = ((quote.last - quote.prevClose) / quote.prevClose) * 100
  return `${percent > 0 ? '+' : ''}${percent.toFixed(2)}%`
}

/**
 * 判断涨跌方向；昨收不可用时按平盘处理。
 *
 * @param quote - 报价
 */
export function quoteDirection(quote: WatchlistQuote): QuoteDirection {
  if (quote.prevClose <= 0 || quote.last === quote.prevClose) return 'flat'
  return quote.last > quote.prevClose ? 'up' : 'down'
}
