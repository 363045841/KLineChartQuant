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
import {
  FOOTPRINT_DEFAULT_PARAMS,
  FOOTPRINT_METRICS,
  FOOTPRINT_ROW_MODES,
  type FootprintParams,
} from '../types.js'

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
  // 活跃柱振幅不参与统计；网格变化后必须重放成交，同时保持总量和 Delta。
  it('reaggregates retained trades when automatic row height changes after a close', () => {
    const compute = createFootprintCalculator()
    const bars = data.map((bar) => ({ ...bar, high: 4, low: 1 }))
    const snapshot = input([
      batch([trade('1', 1500, '1.2', '2', 'buy'), trade('2', 1600, '1.4', '1', 'sell')]),
    ])
    const first = compute(bars, FOOTPRINT_DEFAULT_PARAMS, snapshot)
    expect(first.rowSize).toBe('0.2')
    expect(first.bars[0]?.cells).toHaveLength(2)
    const live = bars.map((bar, index) => (index === 1 ? { ...bar, high: 10 } : bar))
    const intrabar = compute(live, FOOTPRINT_DEFAULT_PARAMS, snapshot)
    expect(intrabar.rowSize).toBe(first.rowSize)
    expect(intrabar.bars[0]).toBe(first.bars[0])
    const closed = [...live, { ...bars[1]!, timestamp: 3000 }]
    const next = compute(closed, FOOTPRINT_DEFAULT_PARAMS, snapshot)
    expect(next.rowSize).toBe('0.4')
    expect(next.bars[0]?.cells).toHaveLength(1)
    expect(next.bars[0]).toMatchObject({ total: '3.8', delta: '1' })
    expect(compute(closed, FOOTPRINT_DEFAULT_PARAMS, structuredClone(snapshot))).toEqual(next)
  })

  // 周期切换即使复用计算器，也应按新柱振幅重新决定网格。
  it('adapts automatic rows to a different candle period', () => {
    const compute = createFootprintCalculator()
    const snapshot = input([])
    const small = data.map((bar) => ({ ...bar, high: 4 }))
    const large = data.map((bar) => ({ ...bar, high: 31 }))
    expect(compute(small, FOOTPRINT_DEFAULT_PARAMS, snapshot).rowSize).toBe('0.2')
    expect(compute(large, FOOTPRINT_DEFAULT_PARAMS, snapshot).rowSize).toBe('2')
    expect(
      compute(large, { ...FOOTPRINT_DEFAULT_PARAMS, rowMode: FOOTPRINT_ROW_MODES.Fixed }, snapshot)
        .rowSize,
    ).toBe('30')
  })

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

  // 不平衡固定按成交量与相邻档比较；成交额口径只改变展示数字，不改变加粗标志。
  it('derives imbalance from volume while displaying turnover', () => {
    const result = createFootprintCalculator()(
      data,
      params,
      input([batch([trade('1', 1000, '1.2', '1', 'buy'), trade('2', 1000, '1.1', '3.1', 'sell')])]),
    )
    const cellAt = (price: string) => result.bars[0]?.cells.find((cell) => cell.price === price)
    // 成交量 3.1 ≥ 1 × 3 判为 Bid 不平衡；成交额 3.41 < 1.2 × 3 则不会触发。
    expect(cellAt('1.1')).toMatchObject({ bid: '3.41', ask: '0', bidImbalance: true })
    expect(cellAt('1.2')).toMatchObject({ bid: '0', ask: '1.2', bidImbalance: false })
  })

  // 切换展示口径只重算数字，复用同一份成交量聚合，不平衡标志保持稳定。
  it('keeps imbalance stable when toggling the display metric', () => {
    const compute = createFootprintCalculator()
    const snapshot = input([
      batch([trade('1', 1000, '1.2', '1', 'buy'), trade('2', 1000, '1.1', '3.1', 'sell')]),
    ])
    const turnover = compute(data, params, snapshot)
    const volume = compute(data, { ...params, metric: FOOTPRINT_METRICS.Volume }, snapshot)
    const lowerOf = (bars: typeof turnover.bars) =>
      bars[0]?.cells.find((cell) => cell.price === '1.1')
    expect(lowerOf(turnover.bars)).toMatchObject({ bid: '3.41', bidImbalance: true })
    expect(lowerOf(volume.bars)).toMatchObject({ bid: '3.1', bidImbalance: true })
  })
})
