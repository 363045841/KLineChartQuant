/** ChartDataManager 行情来源隔离测试：不同市场品种不得复用同一 Buffer。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChartDataManager } from '../chartDataManager'
import {
  createTestChartDataManager,
  createTestDocument,
  createTestProvider,
  instrumentFor,
  makeBarsPage,
  makeKLine,
  registerTestProvider,
  unregisterTestProvider,
} from './helpers/chartDataManagerTestKit'

describe('ChartDataManager data source isolation', () => {
  let manager: ChartDataManager | null = null
  let document: Document

  beforeEach(() => {
    document = createTestDocument()
  })

  afterEach(() => {
    manager?.destroy()
    manager = null
    unregisterTestProvider()
    vi.unstubAllGlobals()
  })

  it('does not reuse primary data across unified markets', async () => {
    let fetchCount = 0
    registerTestProvider(
      createTestProvider({
        fetchBars: {
          async fetch() {
            fetchCount++
            return makeBarsPage([makeKLine(Date.now())], {
              instrumentId: 'test:000001',
              olderData: 'unknown',
            })
          },
        },
      }),
    )
    manager = createTestChartDataManager(document, { viewport: { scrollLeft: 800 } }).manager
    manager.setSymbols([
      {
        symbol: '000001',
        market: 'CN',
        period: 'daily',
        source: 'test',
        instrument: { ...instrumentFor('000001'), id: 'test:CN:000001' },
      },
    ])
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))

    manager.setSymbols([
      {
        symbol: '000001',
        market: 'HK',
        period: 'daily',
        source: 'test',
        instrument: { ...instrumentFor('000001'), id: 'test:HK:000001', sessionId: 'HK' },
      },
    ])
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))

    expect(fetchCount).toBe(2)
  })

})
