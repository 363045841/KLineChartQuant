/**
 * 脚本时间上下文：由就绪行情与市场时段配置派生的唯一换算。
 *
 * 图表与后台计算共用同一份规则，避免两处各自拼装时段。
 */
import type { ScriptTimeContext } from '@363045841yyt/klinechart-plot-contracts'
import type { MarketSessionRegistry } from '@/foundation/config/marketSession/marketSessionRegistry.js'
import type { ReadyMarketSession } from '../types.js'

/**
 * 把就绪行情换算成脚本可读的时间上下文。
 *
 * @param session 已确认来源与品种的就绪行情
 * @param sessions 市场时段注册表
 * @returns 已声明时段配置时返回周期与时段；未声明时返回 undefined
 */
export function createScriptTimeContext(
  session: ReadyMarketSession,
  sessions: MarketSessionRegistry,
): ScriptTimeContext | undefined {
  const { sessionId, exchange } = session.instrument
  const profile = sessionId === undefined ? undefined : sessions.getRequired(sessionId)
  if (profile === undefined) return undefined
  const venue = profile.extendedSessions?.[exchange]
  return {
    period: session.selection.period,
    session:
      venue === undefined
        ? profile
        : { ...profile, premarket: venue.premarket, postmarket: venue.postmarket },
  }
}
