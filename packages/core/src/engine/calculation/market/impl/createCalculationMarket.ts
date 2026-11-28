/**
 * 会话级计算行情：按脚本请求从统一行情服务读取历史，不持有缓存或订阅。
 *
 * 实时性由计算频率保证；需要更早历史时由读取器向前分页。
 */
import type { IndicatorBarsRequest } from '@363045841yyt/klinechart-plot-contracts'
import { createScriptTimeContext } from '@/engine/data/series/scriptTimeContext.js'
import type { MarketDataService } from '@/data/service/types.js'
import type { MarketSessionRegistry } from '@/foundation/config/marketSession/marketSessionRegistry.js'
import type { CalculationMarketData } from '../../types.js'
import { readIndicatorBars } from './readIndicatorBars.js'

/** 创建会话级计算行情；生命周期随共享运行时。 */
export function createCalculationMarket(data: MarketDataService, sessions: MarketSessionRegistry): CalculationMarketData {
  return (bars, session) => Object.freeze({
    symbol: session === undefined ? '' : session.instrument.symbol,
    ...(session === undefined ? {} : { time: createScriptTimeContext(session, sessions) }),
    loadBars: (request: IndicatorBarsRequest, signal?: AbortSignal) =>
      readIndicatorBars({ data, sessions }, bars, request, session ?? null, signal),
  })
}
