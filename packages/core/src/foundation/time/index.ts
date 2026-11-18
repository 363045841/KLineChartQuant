/** 时间语义的唯一入口：格式化、日历刻度与时间投影。 */

export {
  createMarketSessionTimeFormatter,
  createTimeFormatter,
  formatDateInTimeZone,
  formatDateTimeInTimeZone,
  formatRfc3339InTimeZone,
  formatTimeInTimeZone,
  getMarketSessionTimeFormatter,
  parseRfc3339WithOffset,
  resolveDisplayTimeZone,
} from './impl/format.js'
export { createSeriesTimeProjection, resolveSeriesInterval } from './impl/seriesTime.js'
export type { TimeTickRequest } from './impl/ticks.js'
export { frameTimeTicks, resolveTimeTickTarget, resolveTimeTickUnit } from './impl/ticks.js'
export type { TradingDaySession } from './impl/tradingDay.js'
export { createTradingDayIndexer } from './impl/tradingDay.js'
export type {
  MarketSessionTimeFormatter,
  TimeFormatter,
  TimeProjection,
  TimeTick,
  TimeTickUnit,
  TimeZoneSetting,
} from './types.js'
