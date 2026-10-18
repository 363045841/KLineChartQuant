/** 足迹测试共享行情与成交构造；计算、执行和内核测试使用同一份领域输入。 */
import { EMPTY_TRADE_SNAPSHOT, TRADE_STATUS, type MarketTrade, type TradeBatch, type TradeSnapshot } from '@/data/trades/types.js'
import type { KLineData } from '@/foundation/types/price.js'
import type { FootprintInput } from '../../runtime/types.js'
import { FOOTPRINT_METRICS, FOOTPRINT_TEXT_MODES, type FootprintParams, type FootprintBar, type FootprintRenderState } from '../../types.js'

export const data: KLineData[] = [1000, 2000].map((timestamp) => ({ timestamp, open: 1, high: 2, low: 1, close: 1 }))
export const params: FootprintParams = { ticksPerRow: 1, imbalanceRatio: 3, metric: FOOTPRINT_METRICS.Turnover }

/** 每条成交显式声明身份与方向，避免用例隐含依赖默认成交量。 */
export function trade(tradeId: string, timestamp: number, price: string, size: string, side: MarketTrade['side']): MarketTrade {
  return { tradeId, timestamp, price, size, side }
}

/** 历史批次保留覆盖范围，默认覆盖第一根已收盘 K 线。 */
export function batch(items: readonly MarketTrade[], from = 1000, to = 2000, complete = true): TradeBatch {
  return { items, range: { from, to }, complete }
}

/** 只有完整批次贡献覆盖证明，水位来自输入而非执行时钟。 */
export function input(batches: readonly TradeBatch[]): TradeSnapshot {
  return {
    ...EMPTY_TRADE_SNAPSHOT, revision: 1, tickSize: '0.1', status: TRADE_STATUS.ready, batches,
    coverage: batches.filter((item) => item.complete).map((item) => item.range),
    latestTimestamp: batches.reduce((latest, item) => Math.max(latest, item.range.to), 0),
  }
}

/** 执行器测试直接使用领域输入，不注册指标或伪造计算结果。 */
export function runtimeInput(batches: readonly TradeBatch[], marketKey = 'test:BTCUSDT:1min'): FootprintInput {
  return { marketKey, data, params, trades: input(batches) }
}

/** 绘制测试仅声明档位宽度和柱内容，共用完整展示契约。 */
export function createFootprintRenderState(rowSize: number, bars: readonly FootprintBar[]): FootprintRenderState {
  return {
    timestamp: 1,
    textMode: FOOTPRINT_TEXT_MODES.BidAsk,
    series: { status: TRADE_STATUS.ready, message: null, rowSize: String(rowSize), latestTimestamp: 2, bars },
  }
}
