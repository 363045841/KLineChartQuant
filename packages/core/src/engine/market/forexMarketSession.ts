/**
 * 外汇市场画像常量：24/5 工作日近似的 MarketSessionConfig。
 * 周日短时段不建模，未来区预测标签由真实 bar 到达后自愈覆盖。
 */
import type { MarketSessionConfig } from '../../foundation/utils/sessionTimeLabels.js'

/** 外汇 24/5 市场画像：工作日近似（周一至周五全天），周日短时段不建模（预测标签由真实 bar 覆盖）。 */
export const FOREX_MARKET_SESSION: MarketSessionConfig = {
  timeZone: 'UTC',
  sessions: [{ open: 0, close: 24 * 60 }],
  slotMinutes: 24 * 60,
  tradingDays: [1, 2, 3, 4, 5],
}
