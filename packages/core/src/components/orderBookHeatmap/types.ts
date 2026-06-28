/**
 * L2 Order Book Heatmap — public types.
 *
 * Implements the data model described in `docs/ROADMAP.md` §3.2.
 *
 * Critique addressed (PR23): the live render path uses fixed-cadence
 * snapshots (cheap to upload to a GPU storage buffer), while a parallel
 * append-only delta archive preserves the full event stream so that
 * sub-snapshot "flash orders" can be replayed exactly. Snapshot ring is
 * the render source; delta archive is the source of truth.
 *
 * No file in this module imports from `src/` — this component is part of
 * the additive `packages/core/` work.
 */

import type { Signal } from '../../reactivity'

// ---------------------------------------------------------------------------
// Inbound stream
// ---------------------------------------------------------------------------

/**
 * One exchange-pushed delta. `size === 0` means the price level is removed.
 *
 * Timestamp is the **exchange** wall-clock in milliseconds — we use it as
 * the controller's clock so the system is deterministic for tests and
 * correct under bursty traffic (no setInterval).
 */
export interface OrderBookDelta {
  side: 'bid' | 'ask'
  price: number
  size: number
  timestamp: number
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

/**
 * Immutable view of the book at one instant. Prices in this object are
 * always returned in their **dequantized** (real-world) form — clients
 * never see the integer tick index.
 *
 * Bids are sorted descending (best bid first), asks ascending (best ask
 * first). Each entry is `[price, size]`.
 */
export interface BookSnapshot {
  readonly bids: ReadonlyArray<readonly [number, number]>
  readonly asks: ReadonlyArray<readonly [number, number]>
  readonly timestamp: number
}

// ---------------------------------------------------------------------------
// State accumulator
// ---------------------------------------------------------------------------

export interface OrderBookStateOptions {
  /** quantize all input prices to this tick (e.g. 0.01 = cents) */
  tickSize: number
  /** keep at most this many levels per side; oldest-by-distance dropped */
  maxLevels?: number
}

export interface OrderBookState {
  /** Apply one delta. `size === 0` removes the level. */
  applyDelta(delta: OrderBookDelta): void
  /** Take a fresh snapshot (prices dequantized). */
  snapshot(): BookSnapshot
  /** Empty both sides. */
  clear(): void
  /** Latest timestamp seen via {@link applyDelta}. */
  lastTimestamp(): number
}

// ---------------------------------------------------------------------------
// Snapshot ring (live render path)
// ---------------------------------------------------------------------------

export interface SnapshotRing {
  readonly capacity: number
  push(snapshot: BookSnapshot): void
  /** snapshots oldest → newest; never contains gaps */
  toArray(): ReadonlyArray<BookSnapshot>
  size(): number
  clear(): void
}

// ---------------------------------------------------------------------------
// Delta archive (replay path)
// ---------------------------------------------------------------------------

export interface DeltaArchive {
  append(delta: OrderBookDelta): void
  /** inclusive range; deltas with `from <= ts <= to` */
  range(fromTimestamp: number, toTimestamp: number): ReadonlyArray<OrderBookDelta>
  size(): number
  clear(): void
  /** drop oldest deltas until total size ≤ maxSize */
  trim(maxSize: number): void
}

export interface DeltaArchiveOptions {
  /** when set, the archive self-trims after each {@link DeltaArchive.append} */
  maxSize?: number
}

// ---------------------------------------------------------------------------
// Log color scale
// ---------------------------------------------------------------------------

export interface LogColorScale {
  /** returns intensity in [0,1] for the given size */
  intensity(size: number): number
  /** swap the size range (does not retroactively rescale anything) */
  setRange(sizeMin: number, sizeMax: number): void
  /** current range (for callers that need to mirror it into GPU uniforms) */
  range(): { sizeMin: number; sizeMax: number }
}

// ---------------------------------------------------------------------------
// Top-level controller
// ---------------------------------------------------------------------------

export interface HeatmapControllerConfig {
  tickSize: number
  snapshotIntervalMs: number
  snapshotRingCapacity: number
  deltaArchiveMaxSize: number
  logColorRange: { sizeMin: number; sizeMax: number }
}

export interface HeatmapState {
  readonly latestSnapshot: BookSnapshot | null
  readonly snapshotCount: number
  readonly deltaCount: number
}

export interface HeatmapController {
  readonly state: Signal<HeatmapState>

  /**
   * Ingest one L2 delta — canonical method, aligned with the cross-controller
   * `ingest()` convention (VolumeProfile, Footprint). Closes API audit
   * BLOCKER-001 (5-verb intake proliferation).
   */
  ingest(delta: OrderBookDelta): void

  /**
   * @deprecated since 0.1.0-alpha.1 — use {@link HeatmapController.ingest}.
   * Kept as a non-removing alias for at least 6 months for migration.
   */
  ingestDelta(delta: OrderBookDelta): void
  /** Force a snapshot now using the controller's current state. */
  forceSnapshot(): void
  /**
   * Reconstruct snapshots at a regular cadence by replaying the delta archive.
   * `from` is the first snapshot timestamp, `to` is exclusive upper bound.
   */
  replay(
    fromTimestamp: number,
    toTimestamp: number,
    snapshotIntervalMs: number,
  ): ReadonlyArray<BookSnapshot>

  /**
   * Replace the internal book with a full snapshot. Resets the snapshot clock,
   * ring, and archive so the controller is in a clean state — subsequent
   * `ingest(delta)` calls continue normally.
   *
   * Designed for SSE reconnect: Go backend pushes a `type:"snapshot"` event
   * on connect, the connector calls `resetBook()`, then live deltas resume.
   * This avoids racing between REST snapshot and SSE stream.
   */
  resetBook(snapshot: BookSnapshot): void
  setConfig(next: Partial<HeatmapControllerConfig>): void
  dispose(): void
}
