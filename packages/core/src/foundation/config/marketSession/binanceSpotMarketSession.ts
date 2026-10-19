/** Binance 现货市场时段：以 UTC 划分交易日，每周七天全天连续交易。 */
import type { MarketSessionConfig } from '@/foundation/utils/sessionTimeLabels.js'

export const BINANCE_SPOT_MARKET_SESSION: MarketSessionConfig = {
  timeZone: 'UTC',
  sessions: [{ open: 0, close: 24 * 60 }],
  slotMinutes: 1,
  tradingDays: [0, 1, 2, 3, 4, 5, 6],
}
