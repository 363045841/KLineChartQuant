/**
 * Volume Profile — public type contract.
 *
 * Volume Profile aggregates traded volume by **price** (not time), producing a
 * horizontal histogram pinned to the price axis. Traders read it for
 * accumulation zones (POC), the 70% Value Area (VAH/VAL — CME convention),
 * and developing support/resistance.
 *
 * This module owns the **data model + math only**. Rendering belongs to the
 * `@klinechart-quant/core` Renderer/Scene layer (or the maintainer's legacy
 * renderer at `src/core/renderers/Indicator/volumeProfile.ts`, which is kept
 * untouched per branch policy).
 *
 * See `docs/ROADMAP.md` §3.1 for the algorithm rationale and §0 for the
 * controller layering this fits into. See `computeShader.wgsl.md` for the
 * planned WebGPU compute path of the heavy `binBarToBuckets` work.
 */

import type { Signal } from '../../foundation/reactivity/index'

/**
 * How a bar's volume is distributed across price buckets.
 *
 * - `typical-price` — the fast default. The entire bar volume is dropped into
 *   the single bucket containing (high+low+close)/3. O(1) per bar.
 * - `proportional` — accurate. The bar volume is split across every bucket
 *   that overlaps `[low, high]`, proportional to that bucket's price-range
 *   overlap with the bar. O(buckets-spanned) per bar.
 *
 * The trade-off is laid out in `docs/ROADMAP.md` §3.1: typical-price is what
 * you want for live profile rendering at frame rate; proportional is what you
 * want for "true" historical profiles and TPO-style work.
 */
export type BinningMode = 'typical-price' | 'proportional'

/**
 * Inputs to the controller. All fields are deliberately required at the
 * controller surface — `createVolumeProfileController` fills missing fields
 * from sensible defaults so callers can pass `{}`.
 */
export interface VolumeProfileConfig {
  /** Number of price buckets (histogram resolution). Typical 50–200. */
  binCount: number
  /** Per-bar binning strategy. See `BinningMode`. */
  binningMode: BinningMode
  /**
   * Fraction of total volume that must be inside the Value Area, in [0, 1].
   * CME convention is 0.70. Set 1.0 to use the full range, set to e.g. 0.95
   * for institution-style "value extended" envelopes.
   */
  valueAreaPercent: number
}

/**
 * The reactive output. `null` while no bars have been ingested.
 *
 * Prices are absolute (real, not normalised) so renderers can place them on
 * the same Y axis as candles. `buckets` is a `Float64Array` rather than
 * `number[]` for two reasons: (1) contiguous memory layout for cache-friendly
 * argmax / VA scans, and (2) it is the same format we'll upload to a GPU
 * storage buffer once the WebGPU compute path lands (see `computeShader.wgsl.md`).
 */
export interface VolumeProfileState {
  /** Histogram. `buckets[i]` is the total volume in bucket i. */
  buckets: Float64Array
  /** Low-edge price of bucket 0. */
  binMin: number
  /** Price width of one bucket. `buckets.length * binSize = total price span`. */
  binSize: number
  /** Point of Control — center price of the highest-volume bucket. */
  poc: number
  /** Value Area High — upper edge price of the VAH bucket. */
  vah: number
  /** Value Area Low — lower edge price of the VAL bucket. */
  val: number
  /** Sum of every bucket. */
  totalVolume: number
  /** Volume inside the closed Value Area `[valIndex, vahIndex]`. */
  vaVolume: number
}

/**
 * Minimum bar shape consumed by `ingest`. Matches the cross-renderer KLineData
 * subset used elsewhere in core. We intentionally do NOT require `open` or
 * `timestamp` so callers can stream from any source.
 */
export interface VolumeProfileBar {
  high: number
  low: number
  close: number
  volume: number
}

/**
 * Framework-agnostic controller — mirrors `IndicatorSelectorController`'s
 * shape (signals for state, plain functions for mutations, idempotent
 * `dispose`).
 */
export interface VolumeProfileController {
  /** Current config; re-emits when `setConfig` is called. */
  readonly config: Signal<VolumeProfileConfig>
  /** Current state; `null` until the first ingest. */
  readonly state: Signal<VolumeProfileState | null>

  /**
   * Recompute the profile from a fresh bar slice. Idempotent: calling this
   * twice with the same bars yields the same state (it is NOT cumulative —
   * the prior buckets are discarded). Incremental ingestion will land with
   * the GPU compute path; see `computeShader.wgsl.md`.
   */
  ingest(bars: ReadonlyArray<VolumeProfileBar>): void

  /**
   * Patch the config. If `binCount` changes the buckets are re-sized on the
   * next `ingest` (state is cleared immediately because the old buckets are
   * now meaningless under the new resolution).
   */
  setConfig(next: Partial<VolumeProfileConfig>): void

  /** Clear state to null (does not change config). */
  reset(): void

  /**
   * Stop emitting. Subsequent calls to ingest/setConfig/reset are silent
   * no-ops; previously-attached subscribers receive no further
   * notifications. Idempotent.
   */
  dispose(): void
}

/**
 * Result of the Value Area greedy expansion. Indices are inclusive bucket
 * indices; prices are derived by the controller using `binMin + binSize * i`.
 */
export interface ValueAreaResult {
  /** Upper bucket index (inclusive). */
  vahIndex: number
  /** Lower bucket index (inclusive). */
  valIndex: number
  /** Argmax bucket index used as the seed. */
  pocIndex: number
  /** Total of all buckets. */
  totalVolume: number
  /** Sum of `buckets[i]` for `i in [valIndex, vahIndex]`. */
  vaVolume: number
  /** `vaVolume / totalVolume`. 0 when `totalVolume` is 0. */
  vaPercent: number
}
