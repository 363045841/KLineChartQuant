/** 脚本取数阶段：声明请求、异步等待行情快照，不持有计算池槽位。 */
import {
  DEFAULT_INTRABAR_LIMIT,
  DEFAULT_REQUEST_BARS,
  type IndicatorMarketContext,
} from '@363045841yyt/klinechart-plot-contracts'
import type { ScriptWorkerPool } from '@363045841yyt/klinechart-script/worker'

/** Worker只参与短暂的请求声明求值，网络等待始终由行情仓库负责。 */
export async function prepareScriptMarketData(
  worker: ScriptWorkerPool,
  handle: string,
  params: Readonly<Record<string, number | string | boolean>>,
  market: IndicatorMarketContext,
) {
  market.signal?.throwIfAborted()
  const requests = await worker.requests(handle, params, market.symbol, market.signal)
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
  return { symbol: market.symbol, time: market.time, snapshots }
}
