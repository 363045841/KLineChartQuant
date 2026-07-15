/**
 * Chart-type transformers — public type contract.
 *
 * A "chart type" in TradingView (Heikin Ashi, Renko, P&F, Range Bars, etc.) is
 * a **data transform**, not a different renderer. Every output is still
 * OHLCV-shaped, so the same candle renderer paints all of them. This package
 * is therefore deliberately headless: rendering belongs to the
 * Renderer/Scene layer (see `docs/ROADMAP.md` §0).
 *
 * Why this matters for the WebGPU path: because the output is OHLCV, the
 * existing instanced-quad K-line vertex pipeline (see `docs/ROADMAP.md` §2.3)
 * draws Heikin Ashi / Renko / P&F / Range Bars at the same throughput as raw
 * candles — no new render path, no new shader.
 *
 * ## Two transforms in one interface — batch vs incremental
 *
 * Every transform here supports two modes:
 *
 *  - **Batch** (`transform`): pure function over an OHLCV slice. Re-derives the
 *    output from scratch. Use this for chart loads / history scrolls.
 *  - **Incremental** (`appendBar`): consume one live bar at a time, emit zero
 *    or more output bars, and update internal state. Use this for streaming
 *    quotes.
 *
 * Calling `appendBar` repeatedly over the same sequence must produce **bit-for-
 * bit identical** output to a single `transform` over that sequence. The test
 * suite enforces this with a randomised property test on a ≥30-bar input.
 *
 * ## A note on time semantics
 *
 * Renko, P&F and Range Bars all break the "one input bar = one output bar"
 * assumption. We preserve provenance with `sourceBarIndexStart` /
 * `sourceBarIndexEnd` so callers can map back to the source series for
 * tooltips, x-axis labels, and event correlation. The `timestamp` on a
 * derived bar is the timestamp of the source bar that **closed** it (i.e. the
 * trigger).
 */

/** Standard OHLCV row. Timestamps are epoch milliseconds. */
export interface OHLCV {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/**
 * One output bar from a chart-type transform. Extends `OHLCV` so it can flow
 * through the same scale / renderer pipeline as raw candles.
 *
 * `sourceBarIndexStart` / `sourceBarIndexEnd` mark which input rows were
 * aggregated into this output row (inclusive). For 1:1 transforms (Heikin
 * Ashi) they are equal. For aggregating transforms (Renko, P&F, Range Bars)
 * they describe a range of source rows. For "fanning" transforms — one input
 * bar that produces multiple output bars (large-gap Renko, oversized Range
 * bar) — every fanned-out output row shares the same start/end index.
 */
export interface TransformedBar extends OHLCV {
  /** Lowest source index folded into this output bar (inclusive). */
  sourceBarIndexStart: number
  /** Highest source index folded into this output bar (inclusive). */
  sourceBarIndexEnd: number
  /**
   * Transform-specific metadata. Marked `Readonly` so consumers can rely on
   * structural sharing — a transform must never mutate metadata after
   * emitting it.
   */
  meta?: Readonly<Record<string, unknown>>
}

/**
 * Common shape for all chart-type transformers.
 *
 * `transform` is pure — it does NOT mutate `input` and (for stateful
 * transforms) calling it resets internal state first so the result depends
 * only on `input` + `config`.
 *
 * `appendBar` is incremental — it does mutate internal state. Calling
 * `reset()` returns the transform to its initial state.
 *
 * `typeId` is a stable, human-readable identifier used by the scene/registry.
 */
export interface ChartTypeTransform<TConfig = unknown> {
  readonly typeId: string
  transform(input: ReadonlyArray<OHLCV>, config: TConfig): ReadonlyArray<TransformedBar>
  /**
   * Append one input bar and emit zero, one, or many output bars.
   *
   * Implementations that do not support incremental mode omit this method.
   * For Heikin Ashi the output is always exactly one bar per call. For
   * Renko / Range Bars / P&F the count can be 0..N depending on whether the
   * new bar triggers brick/box formation.
   */
  appendBar?(input: OHLCV): ReadonlyArray<TransformedBar>
  /** Drop internal state. Idempotent. Safe to call on stateless transforms. */
  reset?(): void
}
