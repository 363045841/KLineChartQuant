import { KLineChartError } from '../../errors'
import { createSignal, type ReadonlySignal } from '../../foundation/reactivity/signal'

import { CHART_AGENT_ERROR_CODES } from './errors'

import type { IndicatorQuery } from './indicator/indicatorQuery'
import type {
  ChartAgentActiveIndicator,
  ChartAgentContextSnapshot,
  ChartAgentController,
  ChartAgentTimeRange,
} from './types'
import type { ChartViewport, IndicatorInstance, SymbolSpec } from '../../controllers/types'
import type { DataStateModule } from '../../engine/state/dataState'

interface ChartAgentControllerDependencies {
  readonly chartId: string
  readonly dataState: DataStateModule
  readonly currentSpec: ReadonlySignal<SymbolSpec | null>
  readonly viewport: ReadonlySignal<ChartViewport>
  readonly indicators: ReadonlySignal<ReadonlyArray<IndicatorInstance>>
  readonly chartRevision: ReadonlySignal<number>
  readonly indicatorQuery: IndicatorQuery
}

export interface ChartRevisionTracker {
  readonly revision: ReadonlySignal<number>
  dispose(): void
}

/** Track a controller-level monotonic revision without exposing writable state. */
export function createChartRevisionTracker(
  sources: ReadonlyArray<ReadonlySignal<unknown>>,
): ChartRevisionTracker {
  const revision = createSignal(0)
  let disposed = false
  const subscriptions = [...new Set(sources)].map((source) =>
    source.subscribe(() => {
      if (!disposed) revision.set(revision.peek() + 1)
    }),
  )

  return {
    revision,
    dispose(): void {
      if (disposed) return
      disposed = true
      for (const unsubscribe of subscriptions) unsubscribe()
    },
  }
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

function resolveVisibleRange(
  data: ReadonlyArray<{ readonly timestamp: number }>,
  viewport: ChartViewport,
): ChartAgentTimeRange | null {
  const start = Math.max(0, Math.floor(viewport.visibleFrom))
  const end = Math.min(data.length, Math.ceil(viewport.visibleTo))
  const first = data[start]
  const last = data[end - 1]
  if (!first || !last || start >= end) return null
  if (!Number.isFinite(first.timestamp) || !Number.isFinite(last.timestamp)) return null
  return Object.freeze({ from: first.timestamp, to: last.timestamp })
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
  return {
    getContext(): ChartAgentContextSnapshot {
      const activeBuffer = dependencies.dataState.readonly.activeBuffer.peek()
      if (activeBuffer.kind === 'empty' || activeBuffer.data.length === 0) {
        throw new KLineChartError(
          CHART_AGENT_ERROR_CODES.NO_DATA,
          'Chart Agent context requires active market data',
        )
      }

      const spec = dependencies.currentSpec.peek()
      const dataRange = requireTimestampRange(activeBuffer.data)
      const selection = activeBuffer.selection
      const symbol = spec?.instrument?.symbol ?? spec?.symbol ?? null
      const market = spec?.market ?? null
      const exchange = spec?.instrument?.exchange ?? spec?.exchange ?? null
      const dataSource = selection.sourceId || spec?.source || spec?.instrument?.sourceId || null
      const period = selection.kind === 'bars' ? selection.period : 'timeshare'
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
        visibleRange: resolveVisibleRange(activeBuffer.data, dependencies.viewport.peek()),
        activeIndicators: projectIndicators(dependencies.indicators.peek()),
        chartRevision: dependencies.chartRevision.peek(),
        dataRevision: activeBuffer.dataRevision,
      })
    },

    queryIndicator(input: Parameters<IndicatorQuery['queryIndicator']>[0]): Promise<string> {
      return dependencies.indicatorQuery.queryIndicator(input)
    },
  }
}
