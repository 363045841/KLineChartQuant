/**
 * 加密货币市场画像常量：24/7 全周交易的 MarketSessionConfig。
 * 仅用于市场时段描述，未来日期由数据源交易日历提供。
 */
import type { MarketSessionConfig } from '../../foundation/utils/sessionTimeLabels.js'

/** 加密货币 24/7 市场画像：全周交易、全天覆盖。 */
export const CRYPTO_MARKET_SESSION: MarketSessionConfig = {
  timeZone: 'UTC',
  sessions: [{ open: 0, close: 24 * 60 }],
  slotMinutes: 24 * 60,
}
