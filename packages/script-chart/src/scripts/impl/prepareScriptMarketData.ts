/** 脚本取数阶段：声明请求、异步等待行情快照与期权关键位，不持有计算池槽位。 */
import {
  DEFAULT_INTRABAR_LIMIT,
  DEFAULT_OPTION_HISTORY_ROWS,
  DEFAULT_REQUEST_BARS,
  type IndicatorMarketContext,
} from '@363045841yyt/klinechart-plot-contracts'
import type { ScriptOptionLevels } from '@363045841yyt/klinechart-script'
import type { ScriptWorkerPool } from '@363045841yyt/klinechart-script/worker'

/**
 * 按品种映射取本次运行的期权快照。
 *
 * 没有映射、或服务取不到数据时返回 null：脚本据此按「没有期权数据」处理，
 * 不在这一层猜标的，也不把空结果当成正常数据往下传。
 *
 * @param market 指标行情上下文，提供映射结果与取数入口
 * @returns 一个标的的快照；没有可用数据时为 null
 */
async function loadOptionLevels(
  market: IndicatorMarketContext,
): Promise<ScriptOptionLevels | null> {
  const underlying = market.optionUnderlying
  if (underlying === null) return null
  const levels = await market.loadOptionLevels(
    { underlying, historyLimit: DEFAULT_OPTION_HISTORY_ROWS },
    market.signal,
  )
  return levels.length === 0 ? null : { underlying, levels }
}

/** Worker只参与短暂的请求声明求值，网络等待始终由行情仓库负责。 */
export async function prepareScriptMarketData(
  worker: ScriptWorkerPool,
  handle: string,
  params: Readonly<Record<string, number | string | boolean>>,
  market: IndicatorMarketContext,
) {
  market.signal?.throwIfAborted()
  // 期权取数与 request 声明互不依赖，并行等待，避免多一次串行往返。
  const [requests, optionLevels] = await Promise.all([
    worker.requests(handle, params, market.symbol, market.signal),
    loadOptionLevels(market),
  ])
  const snapshots = await Promise.all(
    requests.map(async (request) => ({
      id: request.id,
      bars: await market.loadBars(
        {
          symbol: request.symbol,
          mode: request.mode,
          ignore_invalid_timeframe: request.ignore_invalid_timeframe,
          timeframe: request.timeframe,
          source: request.source,
          calcBarsCount:
            request.calcBarsCount ??
            (request.mode === 'lower_tf' ? DEFAULT_INTRABAR_LIMIT : DEFAULT_REQUEST_BARS),
        },
        market.signal,
      ),
    })),
  )
  market.signal?.throwIfAborted()
  return {
    symbol: market.symbol,
    time: market.time,
    snapshots,
    ...(optionLevels === null ? {} : { optionLevels }),
  }
}
