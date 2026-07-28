import {
  ASHARE_MARKET_SESSION,
  HK_MARKET_SESSION,
  US_MARKET_SESSION,
  type MarketSessionConfig,
} from '../../foundation/utils/sessionTimeLabels'

const BUILTIN_MARKET_SESSIONS: Readonly<Record<string, MarketSessionConfig>> = {
  CN: ASHARE_MARKET_SESSION,
  HK: HK_MARKET_SESSION,
  US: US_MARKET_SESSION,
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
