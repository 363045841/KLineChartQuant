/** ChartDataManager 活动 Buffer lastError 向 dataError 的镜像测试。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChartDataManager } from '../chartDataManager'
import {
  createTestChartDataManager,
  createTestDocument,
  createTestProvider,
  makeBarsPage,
  makeKLine,
  makeTestSymbolSpec,
  registerTestProvider,
  unregisterTestProvider,
} from './helpers/chartDataManagerTestKit'

describe('ChartDataManager error handling', () => {
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

  it('mirrors active buffer lastError onto dataError', async () => {
    registerTestProvider(
      createTestProvider({
        fetchBars: {
          fetch: async () => makeBarsPage([makeKLine(1)], { instrumentId: 'test:000001' }),
        },
      }),
    )
    manager = createTestChartDataManager(document, { viewport: { scrollLeft: 800 } }).manager
    manager.setSymbols([makeTestSymbolSpec('158017')])
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))

    // 只验证镜像链路；取数失败的重试策略由数据层自行覆盖。
    manager.dataBuffer.setError('upstream unavailable')
    expect(manager.dataError.peek()).toBe('upstream unavailable')
  })
})
