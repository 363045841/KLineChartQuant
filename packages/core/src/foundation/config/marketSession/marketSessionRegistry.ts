/** 市场会话注册表：以内置 CN/HK/KR/US/MT5 会话为基础，支持注册覆盖并提供时区与交易时间查询。 */

import {
  ASHARE_MARKET_SESSION,
  HK_MARKET_SESSION,
  KR_MARKET_SESSION,
  type MarketSessionConfig,
  US_MARKET_SESSION,
} from '../../utils/sessionTimeLabels.js'
import { FOREX_MARKET_SESSION } from './forexMarketSession.js'

/** 内置市场会话标识；注册表构造时即可用，无需额外配置。 */
export const BUILTIN_MARKET_IDS = ['CN', 'HK', 'KR', 'US', 'MT5'] as const

/** 内置市场会话标识的字面量联合。 */
export type BuiltinMarketId = (typeof BUILTIN_MARKET_IDS)[number]

/**
 * 市场会话标识：内置值获得补全提示，同时允许通过 `ChartMountOptions.marketSessions`
 * 注册的自定义会话标识（`string & {}` 保留字面量补全）。
 */
export type MarketId = BuiltinMarketId | (string & {})

/**
 * 自定义/内联数据（`applyCustomData` / Vue `customData`）缺省 market 时使用的会话。
 *
 * 内置会话中没有 24x7 会话；选择 MT5（FOREX_MARKET_SESSION）是因为它是唯一一个
 * UTC 时区、单段 00:00–24:00 连续交易、无午休也无交易所本地开收盘时间的会话，
 * 对任意来源的数据最中性：K 线视图下不会按某个交易所的时区/收盘时间解释用户数据。
 * 需要交易所语义（分时槽位、收盘倒计时等）时应显式传入 market。
 */
export const DEFAULT_CUSTOM_DATA_MARKET: BuiltinMarketId = 'MT5'

/** 解析自定义数据的市场标识：去除空白，缺省或空串回落到 {@link DEFAULT_CUSTOM_DATA_MARKET}。 */
export function resolveCustomDataMarket(market: string | undefined): string {
  return market?.trim() || DEFAULT_CUSTOM_DATA_MARKET
}

const BUILTIN_MARKET_SESSIONS: Readonly<Record<BuiltinMarketId, MarketSessionConfig>> = {
  CN: ASHARE_MARKET_SESSION,
  HK: HK_MARKET_SESSION,
  KR: KR_MARKET_SESSION,
  US: US_MARKET_SESSION,
  // MT5 连接器（symbol-catalog 规格约定 sessionId=MT5）的交易时段配置。
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

  /** 查询已注册的市场时段；未注册时返回 undefined，供可选展示功能使用。 */
  get(market: string): MarketSessionConfig | undefined {
    return this.sessions.get(market.trim())
  }
}
