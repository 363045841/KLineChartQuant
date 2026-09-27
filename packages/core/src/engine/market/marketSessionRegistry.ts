/** 市场会话注册表：以内置 CN/HK/KR/US/MT5 会话为基础，支持注册覆盖并提供时区与交易时间查询。 */
import { FOREX_MARKET_SESSION } from './forexMarketSession.js'
import {
  ASHARE_MARKET_SESSION,
  HK_MARKET_SESSION,
  KR_MARKET_SESSION,
  type MarketSessionConfig,
  US_MARKET_SESSION,
} from '../../foundation/utils/sessionTimeLabels.js'

const BUILTIN_MARKET_SESSIONS: Readonly<Record<string, MarketSessionConfig>> = {
  CN: ASHARE_MARKET_SESSION,
  HK: HK_MARKET_SESSION,
  KR: KR_MARKET_SESSION,
  US: US_MARKET_SESSION,
  // MT5 连接器（symbol-catalog 规格约定 sessionId=MT5）以 forex/CFD 为主，
  // 缺省按 24/5 交易日历外推；crypto 等全周品种的周末预测由索引制轴自愈覆盖
  MT5: FOREX_MARKET_SESSION,
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
}
