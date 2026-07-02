import { KLineChartError } from '../../errors'
/**
 * Multi-Timeframe overlay controller.
 *
 * Composes `resampleBars` + `alignToBaseIndex` + a user-supplied `compute`
 * function per series. Holds the base bar buffer + base interval + a Map of
 * active series, exposes a single reactive `series` signal.
 *
 * v1 implementation: full re-resample + full compute on every mutation. The
 * incremental "only re-do the last bucket on `appendBaseBar`" optimization
 * is documented as a follow-up — landing it does not change observable
 * behavior, only frame-time cost. Tests pin the observable shape.
 */

import { createSignal } from '../../reactivity'
import type { Signal } from '../../reactivity'

import { alignToBaseIndex } from './alignToBaseIndex'
import { resampleBars } from './resampleBars'
import type {
  ActiveMtfSeries,
  BaseBar,
  MtfController,
  MtfSeriesDefinition,
  ResampledBar,
} from './types'

export interface CreateMtfControllerInit {
  initialBars?: ReadonlyArray<BaseBar>
  baseIntervalMs?: number
}

export function createMtfController(init: CreateMtfControllerInit = {}): MtfController {
  let disposed = false
  let baseBars: ReadonlyArray<BaseBar> = init.initialBars ?? []
  let baseIntervalMs: number | null = init.baseIntervalMs ?? null

  const definitions = new Map<string, MtfSeriesDefinition>()
  const seriesSignal = createSignal<ReadonlyArray<ActiveMtfSeries>>([])

  const computeOne = (def: MtfSeriesDefinition): ActiveMtfSeries => {
    // No bars or no base interval set → empty aligned values (length 0,
    // matching the empty base buffer).
    if (baseBars.length === 0 || baseIntervalMs === null) {
      return { definition: def, alignedValues: [] }
    }
    const resampled: ReadonlyArray<ResampledBar> = resampleBars(
      baseBars,
      baseIntervalMs,
      def.targetIntervalMs,
    )
    const values = def.compute(resampled)
    if (values.length !== resampled.length) {
      throw new KLineChartError(
        'MTF_CONFIG_INVALID',
        `MtfController: compute fn for series "${def.id}" returned ` +
          `${values.length} values for ${resampled.length} resampled bars; ` +
          `length must match`,
      )
    }
    const aligned = alignToBaseIndex(baseBars, resampled, values, def.targetIntervalMs)
    return { definition: def, alignedValues: aligned }
  }

  const recomputeAll = (): void => {
    const all: ActiveMtfSeries[] = []
    for (const def of definitions.values()) {
      all.push(computeOne(def))
    }
    seriesSignal.set(all)
  }

  const guard = (): boolean => !disposed

  const validateInterval = (targetMs: number): void => {
    if (!Number.isFinite(targetMs) || targetMs <= 0) {
      throw new KLineChartError('MTF_CONFIG_INVALID', 'MtfController: targetIntervalMs must be > 0')
    }
    if (baseIntervalMs !== null && targetMs % baseIntervalMs !== 0) {
      throw new KLineChartError(
        'MTF_CONFIG_INVALID',
        `MtfController: targetIntervalMs (${targetMs}) must be an ` +
          `integer multiple of baseIntervalMs (${baseIntervalMs})`,
      )
    }
  }

  const inner: {
    series: Signal<ReadonlyArray<ActiveMtfSeries>>
    setBaseBars(bars: ReadonlyArray<BaseBar>, intervalMs: number): void
    addSeries(def: MtfSeriesDefinition): string
    removeSeries(id: string): boolean
    updateSeries(id: string, patch: Partial<Omit<MtfSeriesDefinition, 'id'>>): boolean
    appendBaseBar(bar: BaseBar): void
    dispose(): void
  } = {
    series: seriesSignal,

    setBaseBars(bars: ReadonlyArray<BaseBar>, intervalMs: number): void {
      if (!guard()) return
      if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
        throw new KLineChartError(
          'MTF_CONFIG_INVALID',
          'MtfController.setBaseBars: baseIntervalMs must be > 0',
        )
      }
      // If any series has a target that no longer cleanly divides, throw
      // up front rather than letting resampleBars throw later.
      for (const def of definitions.values()) {
        if (def.targetIntervalMs % intervalMs !== 0) {
          throw new KLineChartError(
            'MTF_CONFIG_INVALID',
            `MtfController.setBaseBars: existing series "${def.id}" ` +
              `targetIntervalMs (${def.targetIntervalMs}) does not cleanly ` +
              `divide new baseIntervalMs (${intervalMs})`,
          )
        }
      }
      baseBars = bars
      baseIntervalMs = intervalMs
      recomputeAll()
    },

    addSeries(def): string {
      if (!guard()) return def.id
      if (definitions.has(def.id)) {
        throw new KLineChartError(
          'MTF_CONFIG_INVALID',
          `MtfController.addSeries: id "${def.id}" already in use`,
        )
      }
      validateInterval(def.targetIntervalMs)
      definitions.set(def.id, def)
      recomputeAll()
      return def.id
    },

    removeSeries(id): boolean {
      if (!guard()) return false
      const had = definitions.delete(id)
      if (had) recomputeAll()
      return had
    },

    updateSeries(id, patch): boolean {
      if (!guard()) return false
      const existing = definitions.get(id)
      if (existing === undefined) return false
      const next: MtfSeriesDefinition = {
        ...existing,
        ...patch,
        id: existing.id, // protect against accidental id mutation
      }
      if (patch.targetIntervalMs !== undefined) {
        validateInterval(patch.targetIntervalMs)
      }
      definitions.set(id, next)
      recomputeAll()
      return true
    },

    appendBaseBar(bar): void {
      if (!guard()) return
      baseBars = [...baseBars, bar]
      recomputeAll()
    },

    dispose(): void {
      disposed = true
      definitions.clear()
    },
  }

  // Canonical verbs (API audit BLOCKER-001): `setData` for full
  // replacement, `append` for single-item extension. Old names
  // preserved as aliases on the inner object for the deprecation window.
  return {
    ...inner,
    setData: inner.setBaseBars,
    append: inner.appendBaseBar,
  }
}
