import type { KLineData } from '../controllers/types'
import { DataFetcher } from './fetcherDefinitionRegistry'
import type { FetchConfig } from './types'

async function fetchThousandMock(
  _source: string,
  _config: FetchConfig,
): Promise<ReadonlyArray<KLineData>> {
  console.log('[thousand-mock] generating 10k K-lines')
  const data: KLineData[] = []
  const startTime = new Date('2020-01-01').getTime()
  const dayMs = 24 * 60 * 60 * 1000
  const totalDays = 10000

  const basePrice = 3000
  const meanReversionStrength = 0.0005
  const volatility = 0.02

  const rawWalk: number[] = [basePrice]
  for (let i = 1; i < totalDays; i++) {
    const prev = rawWalk[i - 1]!
    const reversion = meanReversionStrength * (basePrice - prev)
    const change = (Math.random() - 0.5) * 2 * volatility * prev + reversion
    rawWalk.push(prev + change)
  }

  const finalOffset = rawWalk[totalDays - 1]! - basePrice
  for (let i = 0; i < totalDays; i++) {
    const bridge = finalOffset * (i / (totalDays - 1))
    const close = Math.round((rawWalk[i]! - bridge) * 100) / 100

    const timestamp = startTime + i * dayMs
    const open = i === 0 ? basePrice : data[i - 1]!.close

    const high = Math.round(Math.max(open, close) * (1 + Math.random() * 0.01) * 100) / 100
    const low = Math.round(Math.min(open, close) * (1 - Math.random() * 0.01) * 100) / 100
    const volume = Math.floor(1000000 + Math.random() * 5000000)
    data.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
    })
  }

  return data
}

@DataFetcher({
  name: 'mock-10000',
  displayName: 'Mock 10000',
  description: 'Generates ~10,000 random K-line bars with Brownian bridge',
  version: '1.0.0',
  capabilities: ['*'],
})
export class ThousandMockFetcher {
  static fetcher = fetchThousandMock
}

/** @deprecated Use `ThousandMockFetcher.fetcher` directly or rely on routerDataFetcher. */
export const thousandMockDataFetcher = fetchThousandMock
