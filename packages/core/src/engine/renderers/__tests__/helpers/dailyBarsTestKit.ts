import type { KLineData } from '@/foundation/types/price'

const DAY_MS = 86_400_000
const FIRST_DAILY_TS = Date.UTC(2025, 9, 23)

/** 连续日线夹具：第一根为 2025-10-23，按 UTC 每日一根递增。 */
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
