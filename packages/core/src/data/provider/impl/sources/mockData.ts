/** MOCK 历史序列生成器：一次生成后由数据源实例持有，分页和实时更新共享同一份事实。 */
import type { KLineData } from '@/controllers/types.js'

export const MOCK_DAY_MS = 86_400_000

/** 日 K 桶使用 UTC 零点，与实时更新的时间戳保持一致。 */
export function mockDayStart(timestamp: number): number {
  const date = new Date(timestamp)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

/** 生成截止指定日的 count 根日 K；保留原 mock 的价格回归和波动分布。 */
export function generateMockBars(count: number, end: number): KLineData[] {
  const start = end - (count - 1) * MOCK_DAY_MS
  const basePrice = 12.5
  const walk = [basePrice]
  for (let index = 1; index < count; index++) {
    const previous = walk[index - 1]!
    walk.push(previous + 0.005 * (basePrice - previous) + (Math.random() - 0.48) * previous * 0.06)
  }
  const offset = walk[count - 1]! - basePrice
  const data: KLineData[] = []
  for (let index = 0; index < count; index++) {
    const close = Math.round((walk[index]! - offset * index / Math.max(count - 1, 1)) * 100) / 100
    const open = index === 0 ? basePrice : data[index - 1]!.close
    const volume = Math.round(Math.random() * 10_000_000 + 1_000_000)
    data.push({
      timestamp: start + index * MOCK_DAY_MS,
      open, close,
      high: Math.round(Math.max(open, close) * (1 + Math.random() * 0.03) * 100) / 100,
      low: Math.round(Math.min(open, close) * (1 - Math.random() * 0.03) * 100) / 100,
      volume,
      turnover: Math.round(volume * (open + close) / 2),
    })
  }
  return data
}
