/**
 * 外汇市场画像常量：24/5 工作日近似的 MarketSessionConfig。
 * 周日短时段不建模；未来日期标签由数据源交易日历提供。
 */
import type { MarketSessionConfig } from '../../foundation/utils/sessionTimeLabels.js'

/** 外汇 24/5 市场画像：工作日时段描述，周日短时段不建模。 */
export const FOREX_MARKET_SESSION: MarketSessionConfig = {
  timeZone: 'UTC',
  sessions: [{ open: 0, close: 24 * 60 }],
  slotMinutes: 24 * 60,
  tradingDays: [1, 2, 3, 4, 5],
}
