/** 验证足迹统计的十进制精度、时间对齐、增量及缺口语义。 */
import { describe, expect, it } from 'vitest'
import {
  EMPTY_TRADE_SNAPSHOT,
  type MarketTrade,
  TRADE_STATUS,
  type TradeBatch,
  type TradeSnapshot,
} from '../../../data/trades/types.js'
import type { KLineData } from '../../../foundation/types/price.js'
import { createFootprintCalculator } from '../impl/calculateFootprint.js'
import { FOOTPRINT_METRICS, type FootprintParams } from '../types.js'

const data: KLineData[] = [1000, 2000].map((timestamp) => ({
  timestamp,
  open: 1,
  high: 2,
  low: 1,
  close: 1,
}))
const params: FootprintParams = {
  ticksPerRow: 1,
  imbalanceRatio: 3,
  metric: FOOTPRINT_METRICS.Turnover,
}
const trade = (
  tradeId: string,
  timestamp: number,
  price: string,
  size: string,
  side: MarketTrade['side'],
): MarketTrade => ({ tradeId, timestamp, price, size, side })
const batch = (
  items: readonly MarketTrade[],
  from = 1000,
  to = 2000,
  complete = true,
): TradeBatch => ({ items, range: { from, to }, complete })
const input = (batches: readonly TradeBatch[]): TradeSnapshot => ({
  ...EMPTY_TRADE_SNAPSHOT,
  revision: 1,
  tickSize: '0.1',
  status: TRADE_STATUS.ready,
  batches,
})

describe('Footprint calculator', () => {
  // 0.1 + 0.2 必须精确为 0.3；成交恰好落在下一根开盘时归入下一根。
  it('keeps exact decimals and aligns trades to actual candle timestamps', () => {
    const result = createFootprintCalculator()(
      data,
      params,
      input([
        batch([
          trade('1', 1000, '1.2', '0.1', 'buy'),
          trade('2', 1999, '1.2', '0.2', 'buy'),
          trade('3', 2000, '1.1', '0.4', 'sell'),
        ]),
      ]),
    )
    expect(result.bars[0]).toMatchObject({
      timestamp: 1000,
      total: '0.36',
      delta: '0.36',
      complete: true,
    })
    expect(result.bars[1]).toMatchObject({ timestamp: 2000, total: '0.44', delta: '-0.44' })
    expect(result.bars[0]?.cells[0]?.price).toBe('1.2')
  })

  // Worker 结构化复制不能让同一历史批次再次累加。
  it('accepts cloned input and appends new batches without double counting', () => {
    const compute = createFootprintCalculator()
    const first = input([batch([trade('1', 1000, '1.2', '0.1', 'buy')])])
    compute(data, params, first)
    const second = structuredClone(first)
    const result = compute(data, params, {
      ...second,
      batches: [...second.batches, batch([trade('2', 1500, '1.2', '0.2', 'buy')])],
    })
    expect(result.bars[0]?.total).toBe('0.36')
  })

  // 完整范围的空柱是零，未覆盖的空柱必须是 undefined。
  it('distinguishes a covered zero-volume candle from unavailable data', () => {
    const result = createFootprintCalculator()(data, params, input([batch([])]))
    expect(result.bars[0]).toMatchObject({ complete: true, total: '0', cells: [] })
    expect(result.bars[1]).toBeUndefined()
    const gap = createFootprintCalculator()(data, params, input([batch([], 1000, 2000, false)]))
    expect(gap.bars[0]).toBeUndefined()
  })

  // 头部插入会改变下标，结果仍必须按开盘时间保持一致。
  it('rebuilds on a prepend and groups price ticks deterministically', () => {
    const compute = createFootprintCalculator()
    const snapshot = input([batch([trade('1', 1500, '1.29', '2', 'buy')])])
    compute(data, params, snapshot)
    const prepended = [{ ...data[0]!, timestamp: 500 }, ...data]
    const result = compute(prepended, { ...params, ticksPerRow: 2 }, snapshot)
    expect(result.bars[1]?.timestamp).toBe(1000)
    expect(result.bars[1]?.cells[0]?.price).toBe('1.2')
    expect(result.bars[1]?.total).toBe('2.58')
  })

  // 成交量为口径时按原数量累计，不再乘以价格。
  it('aggregates raw size when the metric is volume', () => {
    const result = createFootprintCalculator()(
      data,
      { ...params, metric: FOOTPRINT_METRICS.Volume },
      input([
        batch([
          trade('1', 1000, '1.2', '0.1', 'buy'),
          trade('2', 1000, '1.2', '0.2', 'buy'),
          trade('3', 2000, '1.1', '0.4', 'sell'),
        ]),
      ]),
    )
    expect(result.bars[0]).toMatchObject({ total: '0.3', delta: '0.3' })
    expect(result.bars[1]).toMatchObject({ total: '0.4', delta: '-0.4' })
    expect(result.bars[0]?.cells[0]).toMatchObject({ ask: '0.3', bid: '0' })
  })
})
