import type { KLineData } from '@/foundation/types/price'

const DAY_MS = 86_400_000
const FIRST_DAILY_TS = Date.UTC(2025, 9, 23)

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

/** 测试夹具：模拟数据源已提供的连续未来槽位时间戳。 */
export function createDailyFutureTimestamp(dataLength: number) {
  return (index: number): number | null => (index < 0 ? null : FIRST_DAILY_TS + index * DAY_MS)
}
