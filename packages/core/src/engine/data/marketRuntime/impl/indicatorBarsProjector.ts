/** 指标行情投影器：把共享 Buffer 的有效范围转换成脚本只读 Bar。 */
import {
  type Bar,
  DEFAULT_INTRABAR_LIMIT,
  type IndicatorBarsRequest,
  type ScriptTimeContext,
  timeValue,
} from '@363045841yyt/klinechart-plot-contracts'
import type { KLineBuffer } from '@/data/buffer/types.js'
import type { MarketSessionRegistry } from '@/foundation/config/marketSession/marketSessionRegistry.js'
import type { ReadyMarketSession } from '../types.js'

/** 根据主图会话取得统一的市场时间上下文。 */
export function marketClock(
  session: ReadyMarketSession,
  sessions: MarketSessionRegistry,
): ScriptTimeContext | undefined {
  const id = session.instrument.sessionId
  return id === undefined
    ? undefined
    : { period: session.selection.period, session: sessions.getRequired(id) }
}

/** 截取请求范围并转换成脚本契约，避免脚本接触宿主 Buffer。 */
export function projectIndicatorBars(
  buffer: KLineBuffer,
  request: IndicatorBarsRequest,
  session: ReadyMarketSession,
  clock: ScriptTimeContext | undefined,
  to: number,
): readonly Bar[] {
  const end = clock ? timeValue(clock, 'close', session.selection.period, to) : Infinity
  const available = buffer.getRawData().filter((bar) => bar.timestamp < end)
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
