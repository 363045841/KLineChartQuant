/**
 * MTF Overlay 测试的 BaseBar 构造夹具。
 */

import type { BaseBar } from '../../types'

/**
 * 构造一根 BaseBar，开高低默认等于收盘价、成交量默认 100。
 * @param timestamp bar 开盘时间戳（毫秒）。
 * @param close 收盘价。
 * @param overrides 需要覆盖的字段。
 * @returns 测试用 BaseBar。
 */
export function createBaseBar(
  timestamp: number,
  close: number,
  overrides: Partial<Omit<BaseBar, 'timestamp' | 'close'>> = {},
): BaseBar {
  return {
    timestamp,
    open: close,
    high: close,
    low: close,
    close,
    volume: 100,
    ...overrides,
  }
}
