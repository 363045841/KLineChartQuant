/**
 * Anchored VWAP 测试的 bar 构造夹具。
 */

import type { AVWAPBar } from '../../types'

/**
 * 构造一根 Anchored VWAP 测试 bar。
 * @param high 最高价。
 * @param low 最低价。
 * @param close 收盘价。
 * @param volume 成交量。
 * @returns 测试用 AVWAPBar。
 */
export function createAvwapBar(high: number, low: number, close: number, volume: number): AVWAPBar {
  return { high, low, close, volume }
}
