/**
 * 测试用最小 ChartAgentController 替身。
 *
 * 完整实现 `ChartAgentController` 的全部成员（默认 no-op），并通过 overrides 按用例
 * 覆盖所需字段，替代此前散落的 `{ ... } as ChartAgentController` 部分对象强转。
 * 额外允许注入 `dependencies`，供 `drawing_create` 等原语宿主在测试中解析执行目标。
 */

import type { ChartAgentContextSnapshot, ChartAgentController } from '@363045841yyt/klinechart-core'
import { createSignal } from '@363045841yyt/klinechart-core/reactivity'

/** overrides 在接口字段之外还允许注入原语宿主依赖。 */
export type TestChartAgentOverrides = Partial<ChartAgentController> & {
  dependencies?: Record<string, unknown>
}

/** ChartAgent context 测试快照的默认值；用例只声明差异字段。 */
const DEFAULT_CONTEXT_SNAPSHOT: ChartAgentContextSnapshot = {
  chartId: 'chart-1',
  symbol: 'BTCUSDT',
  symbolName: null,
  market: 'crypto',
  exchange: 'BINANCE',
  period: '1h',
  dataSource: 'fixture',
  timezone: null,
  adjustMode: null,
  dataRange: { from: 1, to: 2, bars: 2 },
  visibleRange: { from: 1, to: 2 },
  selectedKLineBars: null,
  activeIndicators: [],
  drawingSelection: null,
  dataRevision: 1,
}

/** 构造可写、可订阅的 ChartAgent context signal；overrides 只声明差异快照字段。 */
export function createTestChartAgentContext(overrides: Partial<ChartAgentContextSnapshot> = {}) {
  return createSignal<ChartAgentContextSnapshot>({ ...DEFAULT_CONTEXT_SNAPSHOT, ...overrides })
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
    lookupInstrumentsBySymbol: () => Promise.resolve(''),
    queryBars: () => Promise.resolve(''),
    queryTimeShare: () => Promise.resolve(''),
    queryTimeShareRange: () => Promise.resolve(''),
    listDrawings: () => Promise.resolve([]),
  }

  return { ...base, ...overrides }
}
