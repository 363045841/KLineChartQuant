/**
 * Alert 测试的 MarketSnapshot 构造夹具。
 */

import type { MarketSnapshot } from '../../types'

/** `createMarketSnapshot` 允许覆盖的字段。 */
export type MarketSnapshotOverrides = Partial<MarketSnapshot> & {
  /** 收盘价，同时作为默认 bar 的开高低价。 */
  close?: number
  /** bar 成交量，默认 1000。 */
  volume?: number
  /** bar 时间戳，默认 1。 */
  timestamp?: number
}

/**
 * 构造测试用 MarketSnapshot，默认 bar 全为 100、成交量 1000。
 * @param overrides close / volume / timestamp 及 MarketSnapshot 顶层字段覆盖。
 * @returns 测试用 MarketSnapshot。
 */
export function createMarketSnapshot(overrides: MarketSnapshotOverrides = {}): MarketSnapshot {
  const { close = 100, volume = 1000, timestamp = 1, ...rest } = overrides
  return {
    bar: { timestamp, open: close, high: close, low: close, close, volume },
    indicators: {},
    rollingVolume: {},
    ...rest,
  }
}
