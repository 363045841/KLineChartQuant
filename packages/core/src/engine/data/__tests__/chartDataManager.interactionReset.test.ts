/**
 * ChartDataManager 交互重置时机测试。
 *
 * 只有让既有 K 线下标失效的数据变更（整体替换、头部插入）才作废交互态；
 * 实时尾部写入不改变既有下标，若一并重置会打断用户正在进行的手势。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChartDataManager } from '../chartDataManager'
import {
  createTestChartDataManager,
  createTestDocument,
  createTestProvider,
  MS_PER_DAY,
  makeBarsPage,
  makeKLine,
  makeTestSymbolSpec,
  registerTestProvider,
  unregisterTestProvider,
} from './helpers/chartDataManagerTestKit'

describe('ChartDataManager 交互重置时机', () => {
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

  it('实时尾部写入不重置交互，整体替换与历史插入才重置', async () => {
    const now = Date.now()
    const initialStart = now - 365 * MS_PER_DAY
    let fetchCount = 0
    registerTestProvider(
      createTestProvider({
        fetchBars: {
          async fetch() {
            fetchCount++
            return makeBarsPage(
              fetchCount === 1
                ? [makeKLine(initialStart), makeKLine(now)]
                : [makeKLine(initialStart - 90 * MS_PER_DAY)],
              { olderData: fetchCount === 1 ? 'available' : 'exhausted' },
            )
          },
        },
      }),
    )
    const resetInteraction = vi.fn()
    manager = createTestChartDataManager(document, {
      viewport: { scrollLeft: 800 },
      resetInteraction,
    }).manager

    manager.setSymbols([makeTestSymbolSpec('sh.600000')])
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))
    // 首次装载属于整体替换语义 → 作废交互
    expect(resetInteraction).toHaveBeenCalled()

    resetInteraction.mockClear()
    // 实时尾部写入只改末尾，既有下标不变 → 不得作废交互
    manager.updateBars([{ ...makeKLine(now), close: 111 }])
    expect(resetInteraction).not.toHaveBeenCalled()

    resetInteraction.mockClear()
    // 头部插入历史使既有下标后移 → 作废交互
    manager.ensureDataRange(initialStart - 30 * MS_PER_DAY)
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))
    expect(resetInteraction).toHaveBeenCalled()
  })
})
