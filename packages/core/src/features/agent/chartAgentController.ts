import { KLineChartError } from '../../errors'
import { computed, type ReadonlySignal } from '../../foundation/reactivity/signal'
import { lookupInstrumentsBySymbol, searchInstruments } from '../../data/provider/instrumentSearch'
import type { MarketDataProviderRegistry } from '../../data/provider/registry'

import { CHART_AGENT_ERROR_CODES } from './errors'

import type { IndicatorQuery } from './indicator/indicatorQuery'
import type {
  ChartAgentActiveIndicator,
  ChartAgentContextSnapshot,
  ChartAgentController,
  ChartAgentTimeRange,
} from './types'
import type { IndicatorInstance, SymbolSpec } from '../../controllers/types'
import type { DataStateModule } from '../../engine/state/dataState'

interface ChartAgentControllerDependencies {
  readonly chartId: string
  readonly dataState: DataStateModule
  readonly currentSpec: ReadonlySignal<SymbolSpec | null>
  readonly chartMode: ReadonlySignal<'kline' | 'timeshare' | 'fiveDayTimeShare' | 'comparison'>
  readonly selectedRange: ReadonlySignal<ChartAgentTimeRange | null>
  readonly indicators: ReadonlySignal<ReadonlyArray<IndicatorInstance>>
  readonly indicatorQuery: IndicatorQuery
  readonly marketDataProviderRegistry: MarketDataProviderRegistry
}

function projectIndicators(
  indicators: ReadonlyArray<IndicatorInstance>,
): ReadonlyArray<ChartAgentActiveIndicator> {
  return Object.freeze(
    indicators.map((indicator) => {
      const params: Record<string, number> = {}
      for (const [name, value] of Object.entries(indicator.params)) {
        if (typeof value === 'number' && Number.isFinite(value)) params[name] = value
      }
      return Object.freeze({
        instanceId: indicator.id,
        definitionId: indicator.definitionId,
        params: Object.freeze(params),
      })
    }),
  )
}

function requireTimestampRange(data: ReadonlyArray<{ readonly timestamp: number }>): {
  readonly from: number
  readonly to: number
} {
  let from = Number.POSITIVE_INFINITY
  let to = Number.NEGATIVE_INFINITY
  for (const item of data) {
    if (!Number.isFinite(item.timestamp)) continue
    from = Math.min(from, item.timestamp)
    to = Math.max(to, item.timestamp)
  }
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    throw new KLineChartError(
      CHART_AGENT_ERROR_CODES.NO_DATA,
      'Chart Agent context requires active timestamped market data',
    )
  }
  return { from, to }
}

/** Create the stable Agent facade over narrow controller and state projections. */
export function createChartAgentController(
  dependencies: ChartAgentControllerDependencies,
): ChartAgentController {
  // 从 StateKernel 的只读 signal 派生 Agent 上下文，避免消费者维护第二份图表状态。
  function createContext(): ChartAgentContextSnapshot | null {
    const activeBuffer = dependencies.dataState.readonly.activeBuffer()
    if (activeBuffer.kind === 'empty' || activeBuffer.data.length === 0) return null

    const spec = dependencies.currentSpec()
    const dataRange = requireTimestampRange(activeBuffer.data)
    const selection = activeBuffer.selection
    const symbol = spec?.instrument?.symbol ?? spec?.symbol ?? null
    const market = spec?.market ?? null
    const exchange = spec?.instrument?.exchange ?? spec?.exchange ?? null
    const dataSource = selection.sourceId || spec?.source || spec?.instrument?.sourceId || null
    const period = dependencies.chartMode()
    const adjustMode = selection.kind === 'bars' ? selection.adjustment : (spec?.adjust ?? null)
    const timezone =
      activeBuffer.kind === 'timeShare' ? (activeBuffer.timeShareRange?.timezone ?? null) : null

    return Object.freeze({
      chartId: dependencies.chartId,
      symbol,
      market,
      exchange,
      period,
      dataSource,
      timezone,
      adjustMode,
      dataRange: Object.freeze({ ...dataRange, bars: activeBuffer.data.length }),
      visibleRange: dependencies.selectedRange(),
      activeIndicators: projectIndicators(dependencies.indicators()),
      dataRevision: activeBuffer.dataRevision,
    })
  }

  const context = computed(createContext)

  return {
    context,
    getContext(): ChartAgentContextSnapshot {
      const snapshot = createContext()
      if (!snapshot) {
        throw new KLineChartError(
          CHART_AGENT_ERROR_CODES.NO_DATA,
          'Chart Agent context requires active market data',
        )
      }
      return snapshot
    },

    queryIndicator(input: Parameters<IndicatorQuery['queryIndicator']>[0]): Promise<string> {
      return dependencies.indicatorQuery.queryIndicator(input)
    },

    searchInstruments(input) {
      return searchInstruments(dependencies.marketDataProviderRegistry, input)
    },

    lookupInstrumentsBySymbol(input) {
      return lookupInstrumentsBySymbol(dependencies.marketDataProviderRegistry, input)
    },
  }
}
