/**
 * Order Book Heatmap 测试的 OrderBookDelta 构造夹具。
 */

import type { OrderBookDelta } from '../../types'

/**
 * 构造一条 OrderBookDelta，默认 bid、价格 100、数量 1。
 * @param timestamp 交易所时间戳（毫秒）。
 * @param overrides 需要覆盖的字段。
 * @returns 测试用 OrderBookDelta。
 */
export function createOrderBookDelta(
  timestamp: number,
  overrides: Partial<Omit<OrderBookDelta, 'timestamp'>> = {},
): OrderBookDelta {
  return { side: 'bid', price: 100, size: 1, timestamp, ...overrides }
}
