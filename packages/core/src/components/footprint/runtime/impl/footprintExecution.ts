/** 足迹专属执行核心；Worker 和无 Worker 环境共享同一增量与重置语义。 */
import { EMPTY_TRADE_SNAPSHOT } from '@/data/trades/types.js'
import { createFootprintCalculator } from '../../impl/calculateFootprint.js'
import type { FootprintWorkerRequest, FootprintWorkerResponse } from '../types.js'

/** 每个执行器独立拥有成交缓存；切换市场或周期时同时释放聚合缓存。 */
export function createFootprintExecution() {
  let marketKey: string | null = null
  let trades = EMPTY_TRADE_SNAPSHOT
  let calculate = createFootprintCalculator()
  return (request: FootprintWorkerRequest): FootprintWorkerResponse => {
    if (marketKey !== request.marketKey) {
      marketKey = request.marketKey
      calculate = createFootprintCalculator()
      trades = EMPTY_TRADE_SNAPSHOT
    }
    trades = request.trades.mode === 'replace' ? request.trades.snapshot : {
      ...request.trades.snapshot,
      batches: [...trades.batches, ...request.trades.snapshot.batches],
    }
    try {
      return { requestId: request.requestId, series: calculate([...request.data], request.params, trades) }
    } catch (error) {
      return { requestId: request.requestId, error: error instanceof Error ? error.message : String(error) }
    }
  }
}
