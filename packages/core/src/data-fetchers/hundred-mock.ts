import type { KLineData } from '../controllers/types'
import { DataFetcher } from './fetcherDefinitionRegistry'
import type { FetchConfig } from './types'

async function fetchHundredMock(
  _source: string,
  config: FetchConfig,
): Promise<ReadonlyArray<KLineData>> {
  console.log(`[hundred-mock] generating ${config.symbol} ${config.period}`)
  const start = new Date(config.startDate).getTime()
  const end = new Date(config.endDate).getTime()
  const dayMs = 86400000
  const totalDays = Math.floor((end - start) / dayMs) + 1
  if (totalDays <= 0) return []

  const basePrice = 12.5
  const data: KLineData[] = []

  if (totalDays === 1) {
    data.push({
      timestamp: start,
      open: basePrice,
      high: basePrice,
      low: basePrice,
      close: basePrice,
      volume: Math.round(Math.random() * 10000000 + 1000000),
    })
    return data
  }

  const meanReversionStrength = 0.005

  const rawWalk: number[] = [basePrice]
  for (let i = 1; i < totalDays; i++) {
    const prev = rawWalk[i - 1]!
    const reversion = meanReversionStrength * (basePrice - prev)
    const change = (Math.random() - 0.48) * prev * 0.06 + reversion
    rawWalk.push(prev + change)
  }

  const finalOffset = rawWalk[totalDays - 1]! - basePrice
  for (let i = 0; i < totalDays; i++) {
    const bridge = finalOffset * (i / (totalDays - 1))
    const close = Math.round((rawWalk[i]! - bridge) * 100) / 100

    const ts = start + i * dayMs
    const open = i === 0 ? basePrice : data[i - 1]!.close

    const high = Math.round(Math.max(open, close) * (1 + Math.random() * 0.03) * 100) / 100
    const low = Math.round(Math.min(open, close) * (1 - Math.random() * 0.03) * 100) / 100
    const volume = Math.round(Math.random() * 10000000 + 1000000)
    data.push({
      timestamp: ts,
      open,
      high,
      low,
      close,
      volume,
      turnover: Math.round((volume * (open + close)) / 2),
    })
  }

  return data
}

@DataFetcher({
  name: 'mock-100',
  displayName: 'Mock 100',
  description: 'Generates ~100 random K-line bars with Brownian bridge',
  version: '1.0.0',
  capabilities: ['*'],
})
export class HundredMockFetcher {
  static fetcher = fetchHundredMock
}

/** @deprecated Use `HundredMockFetcher.fetcher` directly or rely on routerDataFetcher. */
export const hundredMockDataFetcher = fetchHundredMock
