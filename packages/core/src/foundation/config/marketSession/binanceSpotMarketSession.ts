/** Binance 现货市场时段：以 UTC 划分交易日，每周七天全天连续交易。 */
import type { MarketSessionConfig } from '@/foundation/utils/sessionTimeLabels.js'
import { BUILTIN_MARKET_SESSIONS } from './builtinMarketSessions.js'

export const BINANCE_SPOT_MARKET_SESSION: MarketSessionConfig = BUILTIN_MARKET_SESSIONS.BINANCE_SPOT
