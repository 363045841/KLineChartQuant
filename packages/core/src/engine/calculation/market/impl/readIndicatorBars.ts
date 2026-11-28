/**
 * 脚本行情读取：按请求范围从统一行情服务分页取数，再投影成脚本 Bar。
 *
 * 只读历史、不建立订阅；同一页的缓存与在途请求由行情服务负责合并。
 */
import {
  type Bar,
  DEFAULT_INTRABAR_LIMIT,
  DEFAULT_REQUEST_BARS,
  type IndicatorBarsRequest,
  timeValue,
} from '@363045841yyt/klinechart-plot-contracts'
import { KLINE_PERIODS, type KLineAdjustment, OLDER_DATA_STATUS } from '@/data/provider/types.js'
import type { MarketDataService } from '@/data/service/index.js'
import type { MarketSessionRegistry } from '@/foundation/config/marketSession/marketSessionRegistry.js'
import type { KLineData } from '@/foundation/types/price.js'
import type { ScriptMarketIdentity } from '../../../data/series/types.js'
import { marketClock, projectIndicatorBars } from './projectBars.js'
import { assertSecurityPeriod, requestPeriod } from './requestPeriod.js'

interface IndicatorBarsDependencies {
  readonly data: MarketDataService
  readonly sessions: MarketSessionRegistry
}

/** 读取脚本所需 K 线；范围不足时继续向前翻页，直到满足或数据源耗尽。 */
export async function readIndicatorBars(
  deps: IndicatorBarsDependencies,
  bars: readonly KLineData[],
  request: IndicatorBarsRequest,
  session: ScriptMarketIdentity | null,
  signal?: AbortSignal,
): Promise<readonly Bar[]> {
  signal?.throwIfAborted()
  if (!session) throw new Error('Request 没有有效的行情会话')
  if (!bars.length) return []

  const period = requestPeriod(request.timeframe)
  if (request.mode !== 'lower_tf') assertSecurityPeriod(period, session.selection.period)
  if (
    request.mode === 'lower_tf' &&
    KLINE_PERIODS.indexOf(period) > KLINE_PERIODS.indexOf(session.selection.period)
  ) {
    if (request.ignoreInvalidTimeframe) return []
    throw new TypeError('securityLowerTf的周期不能高于主图')
  }

  const from = bars[0]!.timestamp
  const to = bars[bars.length - 1]!.timestamp
  const source = request.source ?? session.instrument.source
  const adjustment: KLineAdjustment = session.selection.adjustment
  const aggregation = session.selection.barAggregation
  const budget = Math.min(request.calcBarsCount, DEFAULT_INTRABAR_LIMIT)
  const limit =
    request.mode === 'lower_tf' ? Math.min(DEFAULT_REQUEST_BARS, budget) : request.calcBarsCount
  const clock = marketClock(session, deps.sessions)
  if (request.mode === 'lower_tf' && !clock) {
    throw new Error('低周期明细需要品种的市场时段配置')
  }

  const sameInstrument =
    request.symbol === session.instrument.symbol && source === session.instrument.source
  let cursor =
    request.mode === 'lower_tf'
      ? timeValue(clock!, 'close', session.selection.period, to)
      : undefined
  const collected: KLineData[] = []

  for (;;) {
    const page = sameInstrument
      ? await deps.data.read({
          spec: { instrument: session.instrument, period, adjust: adjustment },
          aggregation,
          limit,
          ...(cursor === undefined ? {} : { beforeTimestamp: cursor }),
          ...(signal === undefined ? {} : { signal }),
        })
      : await deps.data.readSymbol({
          source,
          symbol: request.symbol,
          period,
          adjustment,
          aggregation,
          limit,
          ...(cursor === undefined ? {} : { beforeTimestamp: cursor }),
          ...(signal === undefined ? {} : { signal }),
        })
    signal?.throwIfAborted()
    collected.unshift(...page.data)

    const warmup = collected.filter((bar) => bar.timestamp < from).length
    const covered =
      request.mode === 'lower_tf'
        ? collected.length >= budget || (page.data[0]?.timestamp ?? Infinity) <= from
        : warmup >= request.calcBarsCount
    if (
      covered ||
      page.data.length === 0 ||
      (page.older === OLDER_DATA_STATUS.EXHAUSTED && page.data.length < limit)
    ) {
      break
    }
    const next = page.data[0]!.timestamp
    if (cursor !== undefined && next >= cursor) throw new Error('Request 历史游标没有前进')
    cursor = next
  }

  return projectIndicatorBars(collected, request, session, clock, to)
}
