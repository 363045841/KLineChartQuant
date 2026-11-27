/** 脚本行情投影：把已加载的 K 线转换成脚本只读 Bar 数组。 */
import {
  type Bar,
  DEFAULT_INTRABAR_LIMIT,
  type IndicatorBarsRequest,
  type ScriptTimeContext,
  timeValue,
} from '@363045841yyt/klinechart-plot-contracts'
import type { MarketSessionRegistry } from '@/foundation/config/marketSession/marketSessionRegistry.js'
import type { KLineData } from '@/foundation/types/price.js'
import type { ScriptMarketSession } from '../../../data/series/types.js'

/** 从就绪行情取得脚本可读的市场时间上下文。 */
export function marketClock(
  session: ScriptMarketSession,
  sessions: MarketSessionRegistry,
): ScriptTimeContext | undefined {
  const id = session.instrument.sessionId
  return id === undefined
    ? undefined
    : { period: session.selection.period, session: sessions.getRequired(id) }
}

/** 把已加载序列投影成脚本 Bar；时间上界由市场时段决定。 */
export function projectIndicatorBars(
  bars: readonly KLineData[],
  request: IndicatorBarsRequest,
  session: ScriptMarketSession,
  clock: ScriptTimeContext | undefined,
  to: number,
): readonly Bar[] {
  const end = clock ? timeValue(clock, 'close', session.selection.period, to) : Infinity
  const available = bars.filter((bar) => bar.timestamp < end)
  const snapshot =
    request.mode === 'lower_tf'
      ? available.slice(-Math.min(request.calcBarsCount, DEFAULT_INTRABAR_LIMIT))
      : available
  return snapshot.map((bar) =>
    Object.freeze({
      time: bar.timestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume ?? 0,
    }),
  )
}
