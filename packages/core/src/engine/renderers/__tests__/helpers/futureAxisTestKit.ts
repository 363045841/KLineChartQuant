/**
 * 未来区时间轴测试夹具：真实日历的日线序列与 FOREX 交易日历外推回调。
 * 仅供 renderers/__tests__ 消费；vitest 只收集 *.test.ts，本文件不会被当作测试。
 */
import { FOREX_MARKET_SESSION } from '@/engine/market/forexMarketSession'
import { projectTradingTimestamp } from '@/engine/market/futureTimeAxis'
import type { KLineData } from '@/foundation/types/price'

const DAY_MS = 86_400_000

/** 首根日线 2025-10-23（UTC）：连续 idx=99 恰为 2026-01-30（周五）。 */
const FIRST_DAILY_TS = Date.UTC(2025, 9, 23)

/** 构造相邻索引间隔一天的日线序列（合成价格，边界只依赖时间戳）。 */
export function createDailyBars(count: number): KLineData[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: FIRST_DAILY_TS + i * DAY_MS,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1000,
  }))
}

/** 构造未来槽位外推回调：数据区返回真实 timestamp，越界按 FOREX 交易日历外推（跳周末）。 */
export function createDailyFutureTimestamp(dataLength: number) {
  const last = FIRST_DAILY_TS + (dataLength - 1) * DAY_MS
  return (index: number): number | null => {
    if (index < 0) return null
    if (index < dataLength) return FIRST_DAILY_TS + index * DAY_MS
    return projectTradingTimestamp(FOREX_MARKET_SESSION, last, index - dataLength + 1, DAY_MS)
  }
}
