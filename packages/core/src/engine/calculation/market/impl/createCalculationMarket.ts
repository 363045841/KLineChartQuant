/**
 * 会话级计算行情：按脚本请求从统一行情服务读取历史，不持有缓存或订阅。
 *
 * 实时性由计算频率保证；需要更早历史时由读取器向前分页。
 */
import type { IndicatorBarsRequest } from '@363045841yyt/klinechart-plot-contracts'
import { createScriptTimeContext } from '@/engine/data/series/scriptTimeContext.js'
import type { CalculationMarket, CalculationMarketOptions } from '../types.js'
import { readIndicatorBars } from './readIndicatorBars.js'

/** 创建会话级计算行情；生命周期随共享运行时。 */
export function createCalculationMarket(options: CalculationMarketOptions): CalculationMarket {
  const deps = { data: options.data, sessions: options.marketSessions }

  return {
    context(_owner, bars, session) {
      return Object.freeze({
        symbol: session === undefined ? '' : session.instrument.symbol,
        ...(session === undefined
          ? {}
          : { time: createScriptTimeContext(session, options.marketSessions) }),
        loadBars: (request: IndicatorBarsRequest, signal?: AbortSignal) =>
          readIndicatorBars(deps, bars, request, session ?? null, signal),
      })
    },
    retain() {},
    dispose() {},
  }
}
