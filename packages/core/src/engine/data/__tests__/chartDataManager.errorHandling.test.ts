/** ChartDataManager 取数失败向 dataError 的投影。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TestChartDataManager } from './helpers/chartDataManagerTestKit'
import {
  createTestChartDataManager,
  createTestDocument,
  createTestProvider,
  makeTestSymbolSpec,
  registerTestProvider,
  unregisterTestProvider,
} from './helpers/chartDataManagerTestKit'

describe('ChartDataManager error handling', () => {
  let manager: TestChartDataManager | null = null
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

  it('surfaces a failing provider through dataError', async () => {
    registerTestProvider(
      createTestProvider({
        fetchBars: {
          fetch: async () => {
            throw new Error('upstream unavailable')
          },
        },
      }),
    )
    manager = createTestChartDataManager(document, { viewport: { scrollLeft: 800 } }).manager
    manager.setPrimaryMarket(makeTestSymbolSpec('158017'))

    await vi.waitFor(() => expect(manager!.dataError.peek()).toContain('upstream unavailable'), {
      timeout: 5_000,
    })
    expect(manager.dataError.peek()).toContain('upstream unavailable')
  })
})
