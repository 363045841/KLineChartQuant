/**
 * Logarithmic intensity scale for heatmap coloring.
 *
 * ROADMAP §3.2 calls this out specifically. Order-book size distribution
 * spans several orders of magnitude — a linear color scale washes out the
 * fine structure. The mapping is:
 *
 *   intensity = (ln(size) - ln(sizeMin)) / (ln(sizeMax) - ln(sizeMin))
 *
 * Edge cases (all return a value in `[0, 1]`):
 *
 *   size ≤ 0                                  → 0
 *   size ≤ sizeMin                            → 0
 *   size ≥ sizeMax                            → 1
 *   sizeMin === sizeMax (degenerate)          → 0.5 for any positive size
 *   sizeMin or sizeMax not strictly positive  → throw at construction
 */

import { KLineChartError } from '../../errors'

import type { LogColorScale } from './types'

export function createLogColorScale(sizeMin: number, sizeMax: number): LogColorScale {
  let lo = sizeMin
  let hi = sizeMax
  let lnLo = 0
  let lnHi = 0
  let lnSpan = 0

  function recompute(): void {
    validate(lo, hi)
    lnLo = Math.log(lo)
    lnHi = Math.log(hi)
    lnSpan = lnHi - lnLo
  }

  function intensity(size: number): number {
    if (!(size > 0)) return 0
    if (lnSpan === 0) {
      // Degenerate range: any positive size maps to the midpoint.
      return 0.5
    }
    if (size <= lo) return 0
    if (size >= hi) return 1
    const t = (Math.log(size) - lnLo) / lnSpan
    if (t <= 0) return 0
    if (t >= 1) return 1
    return t
  }

  function setRange(nextMin: number, nextMax: number): void {
    lo = nextMin
    hi = nextMax
    recompute()
  }

  function range(): { sizeMin: number; sizeMax: number } {
    return { sizeMin: lo, sizeMax: hi }
  }

  recompute()
  return { intensity, setRange, range }
}

function validate(lo: number, hi: number): void {
  if (!(lo > 0) || !Number.isFinite(lo)) {
    throw new KLineChartError(
      'HEATMAP_CONFIG_INVALID',
      'createLogColorScale: sizeMin must be a positive finite number',
    )
  }
  if (!(hi > 0) || !Number.isFinite(hi)) {
    throw new KLineChartError(
      'HEATMAP_CONFIG_INVALID',
      'createLogColorScale: sizeMax must be a positive finite number',
    )
  }
  if (hi < lo) {
    throw new KLineChartError(
      'HEATMAP_CONFIG_INVALID',
      'createLogColorScale: sizeMax must be ≥ sizeMin',
    )
  }
}
