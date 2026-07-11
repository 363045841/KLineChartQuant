/**
 * Volume Profile controller — framework-agnostic, signal-based.
 *
 * Mirrors the dispose-guard pattern from `createIndicatorSelectorController`
 * so React/Vue/Angular adapters bridge identically. The controller is pure
 * data — no DOM, no rendering, no canvas. It plays the same role as
 * `src/core/indicators/volumeProfileState.ts` (the maintainer's legacy state
 * module) but with the new reactive contract; the legacy state file and the
 * legacy renderer at `src/core/renderers/Indicator/volumeProfile.ts` are
 * intentionally NOT touched (per branch policy).
 *
 * Flow on `ingest`:
 *   1. Walk the bars once to learn `[minLow, maxHigh]`.
 *   2. Derive `binMin`/`binSize` from that range + config.binCount.
 *   3. Allocate a fresh `Float64Array(binCount)` (or reuse if size unchanged).
 *   4. For each bar, call `binBarToBuckets` (typical-price or proportional).
 *   5. `findPOCIndex` → `computeValueArea` → assemble `VolumeProfileState`.
 *
 * Non-goals:
 *   - Incremental ingest. `ingest` always recomputes from scratch. The
 *     incremental path comes with the WebGPU compute shader (see
 *     `computeShader.wgsl.md`).
 *   - Auto-binning by tick size. The current heuristic (range / binCount) is
 *     adequate for visual profiles; tick-snapped binning is a future option.
 */

import { createSignal, type Signal } from '../../foundation/reactivity/index'

import { binBarToBuckets } from './binning'
import { findPOCIndex } from './poc'
import type {
  VolumeProfileBar,
  VolumeProfileConfig,
  VolumeProfileController,
  VolumeProfileState,
} from './types'
import { computeValueArea } from './valueArea'

const DEFAULT_CONFIG: VolumeProfileConfig = {
  binCount: 100,
  binningMode: 'typical-price',
  valueAreaPercent: 0.7,
}

// Smallest binSize we will use. Prevents a degenerate "all bars same price"
// input from producing a division-by-zero. The value is arbitrary but small
// enough that real markets never hit it.
const MIN_BIN_SIZE = 1e-12

export interface VolumeProfileControllerInit {
  config?: Partial<VolumeProfileConfig>
}

export function createVolumeProfileController(
  init?: VolumeProfileControllerInit,
): VolumeProfileController {
  // -------------------------------------------------------------------
  // Signals
  // -------------------------------------------------------------------
  const initialConfig: VolumeProfileConfig = {
    ...DEFAULT_CONFIG,
    ...(init?.config ?? {}),
  }
  // Defensive clamp: percent in [0, 1], binCount >= 1.
  if (initialConfig.valueAreaPercent < 0) initialConfig.valueAreaPercent = 0
  if (initialConfig.valueAreaPercent > 1) initialConfig.valueAreaPercent = 1
  if (initialConfig.binCount < 1) initialConfig.binCount = 1

  const config: Signal<VolumeProfileConfig> = createSignal(initialConfig)
  const state: Signal<VolumeProfileState | null> = createSignal<VolumeProfileState | null>(null)

  // -------------------------------------------------------------------
  // ingest — full recompute
  // -------------------------------------------------------------------
  function ingest(bars: ReadonlyArray<VolumeProfileBar>): void {
    const cfg = config.peek()

    if (bars.length === 0) {
      state.set(null)
      return
    }

    // First pass: range of the data.
    let minLow = Infinity
    let maxHigh = -Infinity
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i]
      if (b === undefined) continue
      if (b.low < minLow) minLow = b.low
      if (b.high > maxHigh) maxHigh = b.high
    }

    if (!Number.isFinite(minLow) || !Number.isFinite(maxHigh)) {
      state.set(null)
      return
    }

    const range = maxHigh - minLow
    // Degenerate range: every bar at the same price. We still want a
    // non-zero binSize so the math works; centre a tiny window on the
    // price so the single bucket captures everything.
    const binSize = range > MIN_BIN_SIZE ? range / cfg.binCount : MIN_BIN_SIZE
    const binMin = minLow

    // Allocate or reuse the buckets. Reuse only if the size matches —
    // changing `binCount` via `setConfig` requires a fresh array.
    const prev = state.peek()
    const buckets =
      prev !== null && prev.buckets.length === cfg.binCount
        ? prev.buckets
        : new Float64Array(cfg.binCount)
    // Zero it (whether reused or freshly allocated) — `fill(0)` is cheap
    // on typed arrays.
    buckets.fill(0)

    // Second pass: drop volume into buckets.
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i]
      if (b === undefined) continue
      binBarToBuckets(b, buckets, binMin, binSize, cfg.binCount, cfg.binningMode)
    }

    // POC + VA.
    const pocIdx = findPOCIndex(buckets)
    // findPOCIndex returns -1 only on empty arrays — guarded above.
    const va = computeValueArea(buckets, pocIdx < 0 ? 0 : pocIdx, cfg.valueAreaPercent)

    // Prices: each bucket spans `[binMin + i*binSize, binMin + (i+1)*binSize)`.
    // We report POC as the bucket *center*, VAH as the upper bucket's high
    // edge, VAL as the lower bucket's low edge — this matches how a
    // renderer wants to draw them: POC as a centerline, VAH/VAL as
    // envelope edges.
    const pocPrice = binMin + (va.pocIndex + 0.5) * binSize
    const vahPrice = binMin + (va.vahIndex + 1) * binSize
    const valPrice = binMin + va.valIndex * binSize

    const next: VolumeProfileState = {
      buckets,
      binMin,
      binSize,
      poc: pocPrice,
      vah: vahPrice,
      val: valPrice,
      totalVolume: va.totalVolume,
      vaVolume: va.vaVolume,
    }
    state.set(next)
  }

  // -------------------------------------------------------------------
  // setConfig — patch + invalidate
  // -------------------------------------------------------------------
  function setConfig(next: Partial<VolumeProfileConfig>): void {
    const cur = config.peek()
    const merged: VolumeProfileConfig = { ...cur, ...next }
    // Re-apply the defensive clamps.
    if (merged.valueAreaPercent < 0) merged.valueAreaPercent = 0
    if (merged.valueAreaPercent > 1) merged.valueAreaPercent = 1
    if (merged.binCount < 1) merged.binCount = 1

    // If binCount changed, the existing buckets are stale (different
    // resolution) — clear state so callers know to re-ingest. Other
    // field changes leave the data untouched until next ingest.
    if (merged.binCount !== cur.binCount) {
      state.set(null)
    }
    config.set(merged)
  }

  // -------------------------------------------------------------------
  // reset — clear state, keep config
  // -------------------------------------------------------------------
  function reset(): void {
    state.set(null)
  }

  // -------------------------------------------------------------------
  // dispose — silence mutators (same pattern as IndicatorSelectorController)
  // -------------------------------------------------------------------
  let disposed = false
  function dispose(): void {
    if (disposed) return
    disposed = true
  }

  function guard<T extends (...args: never[]) => unknown>(fn: T): T {
    return ((...args: Parameters<T>): ReturnType<T> => {
      if (disposed) return undefined as ReturnType<T>
      return fn(...args) as ReturnType<T>
    }) as T
  }

  return {
    config,
    state,
    ingest: guard(ingest),
    setConfig: guard(setConfig),
    reset: guard(reset),
    dispose,
  }
}
