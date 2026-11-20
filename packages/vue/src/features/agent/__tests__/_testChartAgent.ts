/**
 * 测试用最小 ChartAgentController 替身。
 *
 * 控制器现在只持有上下文与工具依赖；用例通过 overrides 覆盖所需字段，
 * 工具依赖用会抛错的替身，避免"静默成功"掩盖接线错误。
 */

import type {
  ChartAgentContextSnapshot,
  ChartAgentController,
  ChartAgentToolDeps,
} from '@363045841yyt/klinechart-core'
import { createSignal } from '@363045841yyt/klinechart-core/reactivity'

/** ChartAgent context 测试快照的默认值；用例只声明差异字段。 */
const DEFAULT_CONTEXT_SNAPSHOT: ChartAgentContextSnapshot = {
  symbol: 'BTCUSDT',
  symbolName: null,
  timezone: null,
  visibleRange: { from: 1, to: 2 },
  selectedKLineBars: null,
  drawingSelection: null,
}

/** 构造可写、可订阅的 ChartAgent context signal；overrides 只声明差异快照字段。 */
export function createTestChartAgentContext(overrides: Partial<ChartAgentContextSnapshot> = {}) {
  return createSignal<ChartAgentContextSnapshot>({ ...DEFAULT_CONTEXT_SNAPSHOT, ...overrides })
}

/** 未被用例接管的领域能力直接失败，避免测试掩盖接线错误。 */
function unused(what: string): never {
  throw new Error(`Test ChartAgent tool dependency not configured: ${what}`)
}

/** 空工具依赖；用例按需覆盖单个命令面。 */
export function createTestToolDeps(
  overrides: Partial<ChartAgentToolDeps> = {},
): ChartAgentToolDeps {
  return {
    indicators: {
      list: () => [],
      add: () => unused('indicators.add'),
      read: () => unused('indicators.read'),
      update: () => unused('indicators.update'),
      move: () => unused('indicators.move'),
      remove: () => unused('indicators.remove'),
      resolveDefinition: async () => unused('indicators.resolveDefinition'),
    },
    drawings: {
      list: () => ({ timezone: 'UTC', period: '1h', drawings: [] }),
      create: () => unused('drawings.create'),
      update: () => unused('drawings.update'),
      remove: () => unused('drawings.remove'),
    },
    comparisons: {
      list: () => [],
      create: async () => unused('comparisons.create'),
      setVisible: () => unused('comparisons.setVisible'),
      remove: () => unused('comparisons.remove'),
    },
    market: {
      listSources: () => [],
      lookup: async () => unused('market.lookup'),
      bars: async () => unused('market.bars'),
      timeShare: async () => unused('market.timeShare'),
      indicatorValues: async () => unused('market.indicatorValues'),
    },
    scripts: {
      list: () => [],
      read: () => unused('scripts.read'),
    },
    ...overrides,
  }
}

/** 创建一个最小可用的 ChartAgentController；未覆盖的方法均为 no-op。 */
export function createTestChartAgent(
  overrides: Partial<ChartAgentController> & { tools?: ChartAgentToolDeps } = {},
): ChartAgentController {
  const context = createSignal<ReturnType<ChartAgentController['getContext']> | null>(null)

  const base: ChartAgentController = {
    context,
    tools: createTestToolDeps(),
    getContext() {
      const snapshot = context.peek()
      if (snapshot === null) throw new Error('Test Agent context is not configured')
      return snapshot
    },
  }

  return { ...base, ...overrides }
}
