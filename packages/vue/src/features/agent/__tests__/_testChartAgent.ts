/**
 * 测试用最小 ChartAgentController 替身。
 *
 * 完整实现 `ChartAgentController` 的全部成员（默认 no-op），并通过 overrides 按用例
 * 覆盖所需字段，替代此前散落的 `{ ... } as ChartAgentController` 部分对象强转。
 * 额外允许注入 `dependencies`，供 `drawing_create` 等原语宿主在测试中解析执行目标。
 */

import { createSignal } from '@363045841yyt/klinechart-core/reactivity'

import type { ChartAgentController } from '@363045841yyt/klinechart-core'

/** overrides 在接口字段之外还允许注入原语宿主依赖。 */
export type TestChartAgentOverrides = Partial<ChartAgentController> & {
  dependencies?: Record<string, unknown>
}

/** 创建一个最小可用的 ChartAgentController；未覆盖的方法均为 no-op。 */
export function createTestChartAgent(
  overrides: TestChartAgentOverrides = {},
): ChartAgentController {
  const context = createSignal<ReturnType<ChartAgentController['getContext']> | null>(null)

  const base: ChartAgentController = {
    context,
    toolHosts: [],
    getContext() {
      const snapshot = context.peek()
      if (snapshot === null) throw new Error('Test Agent context is not configured')
      return snapshot
    },
    getAvailableDrawingPaneIds: () => [],
    getAvailableMarketDataSourceIds: () => [],
    queryIndicator: () => Promise.resolve(''),
    searchInstruments: () => Promise.resolve([]),
    lookupInstrumentsBySymbol: () => Promise.resolve([]),
    queryBars: () => Promise.resolve(''),
    queryTimeShare: () => Promise.resolve(''),
    queryTimeShareRange: () => Promise.resolve(''),
    listDrawings: () => Promise.resolve([]),
  }

  return { ...base, ...overrides }
}
