/** ChartDataManager 活动 Buffer lastError 向 dataError 的镜像与清除测试。 */
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

  it('clears the mirrored error once a later load succeeds', async () => {
    let failing = true
    registerTestProvider(
      createTestProvider({
        fetchBars: {
          fetch: async () => {
            // 先让取数持续失败，再放开：验证失败留下的错误会被下一次成功加载清除。
            if (failing) throw new Error('upstream unavailable')
            return makeBarsPage([makeKLine(1)], { instrumentId: 'test:000001' })
          },
        },
      }),
    )
    manager = createTestChartDataManager(document).manager
    manager.setSymbols([makeTestSymbolSpec('158017')])
    // 缓存层有 2 次重试（1s + 2s 退避），错误要等重试耗尽才落到 Buffer；路由会给消息加来源前缀。
    await vi.waitFor(
      () => expect(manager!.dataError.peek()).toBe('[test] Error: upstream unavailable'),
      { timeout: 10_000 },
    )

    failing = false
    manager.setSymbols([makeTestSymbolSpec('158017')])
    await vi.waitFor(() => expect(manager!.dataError.peek()).toBeNull())
  }, 20_000)
})
