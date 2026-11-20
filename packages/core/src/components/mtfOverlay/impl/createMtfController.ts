/** Owns base data and publishes complete, aligned multi-timeframe series. */
import { KLineChartError, MTF_ERROR_CODES } from '@/errors.js'
import { asReadonlySignal, createSignal } from '@/foundation/reactivity/index.js'
import type { ActiveMtfSeries, BaseBar, CreateMtfControllerInit, MtfController, MtfSeriesDefinition } from '../types.js'
import { alignToBaseIndex } from './alignToBaseIndex.js'
import { resampleBars } from './resampleBars.js'

function invalid(message: string): KLineChartError {
  return new KLineChartError(MTF_ERROR_CODES.CONFIG_INVALID, message)
}

function validateInterval(interval: number, label: string): void {
  if (!Number.isFinite(interval) || interval <= 0) throw invalid(`${label} must be > 0`)
}

function project(definition: MtfSeriesDefinition, bars: readonly BaseBar[], interval: number | null): ActiveMtfSeries {
  validateInterval(definition.targetIntervalMs, 'targetIntervalMs')
  if (interval !== null && definition.targetIntervalMs % interval !== 0) {
    throw invalid(`Series "${definition.id}" targetIntervalMs must be a multiple of baseIntervalMs`)
  }
  if (interval === null || bars.length === 0) {
    return Object.freeze({ definition, alignedValues: Object.freeze([]) })
  }
  const resampled = resampleBars(bars, interval, definition.targetIntervalMs)
  const values = definition.compute(resampled)
  if (values.length !== resampled.length) {
    throw invalid(`Series "${definition.id}" returned ${values.length} values for ${resampled.length} bars`)
  }
  const alignedValues = Object.freeze(alignToBaseIndex(bars, resampled, values, definition.targetIntervalMs))
  return Object.freeze({ definition, alignedValues })
}

export function createMtfController(init: CreateMtfControllerInit = {}): MtfController {
  let bars = (init.initialBars ?? []).map((bar) => ({ ...bar }))
  let interval = init.baseIntervalMs ?? null
  if (interval !== null) validateInterval(interval, 'baseIntervalMs')
  const series = createSignal<readonly ActiveMtfSeries[]>(Object.freeze([]))
  let disposed = false
  let computing = false

  function assertIdle(): void {
    if (computing) throw invalid('MTF series computation cannot mutate its controller')
  }

  function prepare(definitions: readonly MtfSeriesDefinition[], nextBars: readonly BaseBar[], nextInterval: number | null) {
    assertIdle()
    computing = true
    try {
      return Object.freeze(definitions.map((definition) => project(definition, nextBars, nextInterval)))
    } finally {
      computing = false
    }
  }

  function commitData(nextBars: BaseBar[], nextInterval: number | null): void {
    const nextSeries = prepare(series.peek().map(({ definition }) => definition), nextBars, nextInterval)
    bars = nextBars
    interval = nextInterval
    series.set(nextSeries)
  }

  function setData(nextBars: readonly BaseBar[], nextInterval: number): void {
    if (disposed) return
    validateInterval(nextInterval, 'baseIntervalMs')
    commitData(nextBars.map((bar) => ({ ...bar })), nextInterval)
  }

  function append(bar: BaseBar): void {
    if (!disposed) commitData([...bars, { ...bar }], interval)
  }

  return {
    series: asReadonlySignal(series),
    setData,
    append,
    addSeries(definition) {
      if (disposed) return definition.id
      const current = series.peek()
      if (current.some((entry) => entry.definition.id === definition.id)) {
        throw invalid(`Series id "${definition.id}" already in use`)
      }
      const next = prepare([Object.freeze({ ...definition })], bars, interval)
      series.set(Object.freeze([...current, ...next]))
      return definition.id
    },
    updateSeries(id, patch) {
      if (disposed) return false
      const current = series.peek()
      const index = current.findIndex(({ definition }) => definition.id === id)
      if (index === -1) return false
      const definition = Object.freeze({ ...current[index].definition, ...patch, id })
      const [next] = prepare([definition], bars, interval)
      series.set(Object.freeze(current.map((entry, i) => (i === index ? next : entry))))
      return true
    },
    removeSeries(id) {
      if (disposed) return false
      assertIdle()
      const current = series.peek()
      const next = current.filter(({ definition }) => definition.id !== id)
      if (current.length === next.length) return false
      series.set(Object.freeze(next))
      return true
    },
    dispose() {
      assertIdle()
      disposed = true
      bars = []
    },
  }
}
