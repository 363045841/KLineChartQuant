/** 市场会话注册表：内置股票、MT5 与 Binance 现货时段，支持注册覆盖及交易时间查询。 */

import {
  ASHARE_MARKET_SESSION,
  HK_MARKET_SESSION,
  KR_MARKET_SESSION,
  type MarketSessionConfig,
  US_MARKET_SESSION,
} from '../../utils/sessionTimeLabels.js'
import { BINANCE_SPOT_MARKET_SESSION } from './binanceSpotMarketSession.js'
import { FOREX_MARKET_SESSION } from './forexMarketSession.js'

const BUILTIN_MARKET_SESSIONS: Readonly<Record<string, MarketSessionConfig>> = {
  CN: ASHARE_MARKET_SESSION,
  HK: HK_MARKET_SESSION,
  KR: KR_MARKET_SESSION,
  US: US_MARKET_SESSION,
  // MT5 连接器（symbol-catalog 规格约定 sessionId=MT5）的交易时段配置。
  MT5: FOREX_MARKET_SESSION,
  // Binance 连接器返回的 sessionId，与交易所名称 BINANCE 区分。
  BINANCE_SPOT: BINANCE_SPOT_MARKET_SESSION,
}

function isValidSession(config: MarketSessionConfig): boolean {
  if (!config.timeZone.trim() || config.sessions.length === 0) return false
  if (config.slotMinutes !== undefined && config.slotMinutes <= 0) return false
  return config.sessions.every(
    ({ open, close }) =>
      Number.isFinite(open) && Number.isFinite(close) && open >= 0 && close > open,
  )
}

export class MarketSessionRegistry {
  private readonly sessions = new Map<string, MarketSessionConfig>(
    Object.entries(BUILTIN_MARKET_SESSIONS),
  )

  constructor(overrides?: Readonly<Record<string, MarketSessionConfig>>) {
    for (const [market, config] of Object.entries(overrides ?? {})) {
      this.register(market, config)
    }
  }

  register(market: string, config: MarketSessionConfig): void {
    const id = market.trim()
    if (!id) throw new Error('Market id is required')
    if (!isValidSession(config)) throw new Error(`Invalid market session: ${id}`)
    this.sessions.set(id, config)
  }

  getRequired(market: string): MarketSessionConfig {
    const config = this.sessions.get(market)
    if (!config) throw new Error(`Market session is not registered: ${market}`)
    return config
  }

  /** 查询已注册的市场时段；未注册时返回 undefined，供可选展示功能使用。 */
  get(market: string): MarketSessionConfig | undefined {
    return this.sessions.get(market.trim())
  }
}
