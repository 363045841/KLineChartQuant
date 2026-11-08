/** 内置市场时段的唯一数据源；JSON同时保留来源、覆盖范围及年度例外，供后续脚本时间API消费。 */
import type { MarketSessionConfig } from '../../utils/sessionTimeLabels.js'
import sessions from './builtinMarketSessions.json'

export const BUILTIN_MARKET_SESSIONS = sessions satisfies Readonly<Record<string, MarketSessionConfig>>
