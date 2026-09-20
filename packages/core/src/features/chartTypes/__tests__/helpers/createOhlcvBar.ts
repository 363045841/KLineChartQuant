/**
 * chartTypes 测试的 OHLCV 构造夹具。
 */

import type { OHLCV } from '../../types'

/** 测试 K 线的默认价格与默认成交量。 */
const DEFAULT_VALUE = 100

/**
 * 生成第 index 根测试 K 线，默认全 100、成交量 100。
 * @param index K 线下标，用于推导时间戳。
 * @param overrides 需要覆盖的 OHLCV 字段。
 * @returns 测试用 OHLCV。
 */
export function createOhlcvBar(index: number, overrides: Partial<OHLCV> = {}): OHLCV {
  return {
    timestamp: 1_700_000_000_000 + index * 60_000,
    open: DEFAULT_VALUE,
    high: DEFAULT_VALUE,
    low: DEFAULT_VALUE,
    close: DEFAULT_VALUE,
    volume: DEFAULT_VALUE,
    ...overrides,
  }
}
