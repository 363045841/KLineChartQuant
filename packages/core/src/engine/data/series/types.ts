/** 已就绪行情与脚本计算共用的会话身份契约。 */

import type { BarsSelection } from '@/data/buffer/seriesSelection.js'
import type { InstrumentDescriptor, SourceCapabilities } from '@/data/provider/types.js'

/** 脚本计算需要的最小行情身份；能力位不参与时间与投影换算。 */
export interface ScriptMarketSession {
  readonly selection: BarsSelection
  readonly instrument: InstrumentDescriptor
}

/** 已确认来源且已加载首批 K 线的活动行情；null 表示尚未就绪或非 K 线视图。 */
export interface ReadyMarketSession extends ScriptMarketSession {
  readonly capabilities: SourceCapabilities
}

/**
 * 会话与品种是否同时声明支持原始实时成交流。
 *
 * 能力位判断只此一处：成交流订阅和有无原始逐笔成交的显示模式判断共用同一份规则。
 *
 * @param session - 已就绪的活动行情
 * @returns 会话源、品种原始成交与实时流三项能力是否齐备
 */
export function supportsRawTradeStream(session: ReadyMarketSession): boolean {
  const { instrument } = session
  return Boolean(
    session.capabilities.trades?.live &&
      instrument.capabilities.trades?.raw &&
      instrument.capabilities.trades.live,
  )
}
