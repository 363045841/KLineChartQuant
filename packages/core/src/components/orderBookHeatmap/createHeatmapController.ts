/**
 * HeatmapController — composes the order-book accumulator, snapshot ring,
 * and delta archive into a single reactive surface.
 *
 * Timing (this is load-bearing): we do **not** schedule snapshots via
 * `setInterval`. The controller treats incoming delta timestamps as the
 * wall clock. When `ingestDelta` sees a delta whose timestamp is more than
 * `snapshotIntervalMs` after the previous snapshot, it pushes a snapshot
 * before applying the new delta. Two upsides:
 *
 *   1. Deterministic tests — no fake timers required.
 *   2. Correct under bursty traffic — snapshot cadence follows market time,
 *      not real time, so replay and live observation see the same grid.
 *
 * The `state` signal updates once per delta ingested. It exposes the
 * **latest** snapshot (for read-time convenience) plus the cumulative
 * snapshot / delta counts so adapters can use it as a render trigger.
 */

import { createSignal, type Signal } from '../../reactivity'
import { KLineChartError } from '../../errors'
import { createDeltaArchive } from './deltaArchive'
import { createLogColorScale } from './logColorScale'
import { createOrderBookState } from './createOrderBookState'
import { createSnapshotRing } from './snapshotRing'
import type {
  BookSnapshot,
  DeltaArchive,
  HeatmapController,
  HeatmapControllerConfig,
  HeatmapState,
  LogColorScale,
  OrderBookDelta,
  OrderBookState,
  SnapshotRing,
} from './types'

const DEFAULT_CONFIG: HeatmapControllerConfig = {
  tickSize: 0.01,
  snapshotIntervalMs: 100,
  snapshotRingCapacity: 600,
  deltaArchiveMaxSize: 1_000_000,
  logColorRange: { sizeMin: 1, sizeMax: 1_000_000 },
}

export function createHeatmapController(
  init?: Partial<HeatmapControllerConfig>,
): HeatmapController {
  let config: HeatmapControllerConfig = { ...DEFAULT_CONFIG, ...init }
  if (init?.logColorRange) {
    config = { ...config, logColorRange: { ...init.logColorRange } }
  }
  validateConfig(config)

  let book: OrderBookState = createOrderBookState({ tickSize: config.tickSize })
  let ring: SnapshotRing = createSnapshotRing(config.snapshotRingCapacity)
  let archive: DeltaArchive = createDeltaArchive({
    maxSize: config.deltaArchiveMaxSize,
  })
  const colorScale: LogColorScale = createLogColorScale(
    config.logColorRange.sizeMin,
    config.logColorRange.sizeMax,
  )

  const state: Signal<HeatmapState> = createSignal<HeatmapState>({
    latestSnapshot: null,
    snapshotCount: 0,
    deltaCount: 0,
  })

  // `snapshotClock` is the timestamp of the LAST emitted (or anchored)
  // snapshot column. It advances by exactly `snapshotIntervalMs` per
  // emission so we never drift even if deltas cluster mid-interval, and
  // we don't depend on `book.lastTimestamp()` (which lags behind the
  // grid clock when the book is quiescent).
  let snapshotClock: number | null = null
  let snapshotCount = 0
  let deltaCount = 0
  let disposed = false

  function pushSnapshotAt(ts: number): BookSnapshot {
    const raw = book.snapshot()
    const snap: BookSnapshot = {
      bids: raw.bids,
      asks: raw.asks,
      timestamp: ts,
    }
    ring.push(snap)
    snapshotCount++
    return snap
  }

  function publish(latest: BookSnapshot | null): void {
    state.set({
      latestSnapshot: latest,
      snapshotCount,
      deltaCount,
    })
  }

  function ingestDelta(delta: OrderBookDelta): void {
    if (disposed) return
    const interval = config.snapshotIntervalMs

    // 1. Anchor the snapshot clock to the first delta we ever see.
    //    The first delta does NOT trigger a snapshot — there is no
    //    prior column to emit. The snapshot for column N (timestamp
    //    `anchor + N * interval`) is emitted when a delta with
    //    timestamp ≥ `anchor + (N+1) * interval` arrives.
    if (snapshotClock === null) {
      snapshotClock = delta.timestamp
      archive.append(delta)
      deltaCount++
      book.applyDelta(delta)
      publish(state.peek().latestSnapshot)
      return
    }

    // 2. Emit one snapshot per interval boundary CROSSED. The snapshot
    //    captures the book state up to (but not including) `delta`.
    const maxCatchUp = config.snapshotRingCapacity
    let emitted = 0
    let latest: BookSnapshot | null = state.peek().latestSnapshot
    while (delta.timestamp - snapshotClock >= interval && emitted < maxCatchUp) {
      snapshotClock += interval
      latest = pushSnapshotAt(snapshotClock)
      emitted++
    }

    // 3. Record the raw delta and update the live book.
    archive.append(delta)
    deltaCount++
    book.applyDelta(delta)

    publish(latest)
  }

  function forceSnapshot(): void {
    if (disposed) return
    // `forceSnapshot` uses the book's latest delta timestamp as the
    // column timestamp — it's an out-of-band emission, not a
    // grid-aligned one, so we don't advance `snapshotClock`.
    const snap = pushSnapshotAt(book.lastTimestamp())
    publish(snap)
  }

  function replay(
    fromTimestamp: number,
    toTimestamp: number,
    snapshotIntervalMs: number,
  ): ReadonlyArray<BookSnapshot> {
    if (disposed) return []
    if (snapshotIntervalMs <= 0) {
      throw new KLineChartError('HEATMAP_CONFIG_INVALID', 'replay: snapshotIntervalMs must be > 0')
    }
    if (toTimestamp < fromTimestamp) return []
    // Reconstruct from a brand-new book. We don't reuse `book` because
    // replay must be side-effect-free with respect to live state.
    const replayBook = createOrderBookState({ tickSize: config.tickSize })
    // We need ALL deltas up to `toTimestamp` to reach the correct state;
    // we just don't emit snapshots before `fromTimestamp`.
    const deltas = archive.range(Number.NEGATIVE_INFINITY, toTimestamp)
    // Stable sort by timestamp (archive append order is mostly but not
    // strictly monotonic — defending against out-of-order arrivals).
    const sorted = [...deltas].sort((a, b) => a.timestamp - b.timestamp)

    const out: BookSnapshot[] = []
    let nextSnapTs = fromTimestamp
    let cursor = 0
    while (nextSnapTs <= toTimestamp) {
      // Apply every delta with ts ≤ nextSnapTs.
      while (cursor < sorted.length && sorted[cursor].timestamp < nextSnapTs) {
        replayBook.applyDelta(sorted[cursor])
        cursor++
      }
      const snap = replayBook.snapshot()
      // Pin the snapshot timestamp to the grid column, not the latest
      // delta — callers want a regular series.
      out.push({
        bids: snap.bids,
        asks: snap.asks,
        timestamp: nextSnapTs,
      })
      nextSnapTs += snapshotIntervalMs
    }
    return out
  }

  function setConfig(next: Partial<HeatmapControllerConfig>): void {
    if (disposed) return
    const merged: HeatmapControllerConfig = { ...config, ...next }
    if (next.logColorRange) {
      merged.logColorRange = { ...next.logColorRange }
    }
    validateConfig(merged)
    const tickChanged = merged.tickSize !== config.tickSize
    const capacityChanged = merged.snapshotRingCapacity !== config.snapshotRingCapacity
    const archiveMaxChanged = merged.deltaArchiveMaxSize !== config.deltaArchiveMaxSize
    const colorChanged =
      merged.logColorRange.sizeMin !== config.logColorRange.sizeMin ||
      merged.logColorRange.sizeMax !== config.logColorRange.sizeMax
    config = merged

    if (tickChanged) {
      // Rebuild book against the new tick. Replay archive so the live
      // view stays in sync with what we've already ingested.
      book = createOrderBookState({ tickSize: config.tickSize })
      const all = archive.range(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY)
      for (const d of all) book.applyDelta(d)
    }
    if (capacityChanged) {
      const old = ring.toArray()
      ring = createSnapshotRing(config.snapshotRingCapacity)
      // Replay tail into the new ring.
      const start = Math.max(0, old.length - config.snapshotRingCapacity)
      for (let i = start; i < old.length; i++) ring.push(old[i])
    }
    if (archiveMaxChanged) {
      archive.trim(config.deltaArchiveMaxSize)
    }
    if (colorChanged) {
      colorScale.setRange(config.logColorRange.sizeMin, config.logColorRange.sizeMax)
    }
    publish(state.peek().latestSnapshot)
  }

  function resetBook(snapshot: BookSnapshot): void {
    if (disposed) return
    book = createOrderBookState({ tickSize: config.tickSize })
    for (const [price, size] of snapshot.bids) {
      book.applyDelta({ side: 'bid', price, size, timestamp: snapshot.timestamp })
    }
    for (const [price, size] of snapshot.asks) {
      book.applyDelta({ side: 'ask', price, size, timestamp: snapshot.timestamp })
    }
    snapshotClock = null
    snapshotCount = 0
    deltaCount = 0
    ring.clear()
    archive.clear()
    publish(book.snapshot())
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    book.clear()
    ring.clear()
    archive.clear()
  }

  return {
    state,
    // Canonical verb (API audit BLOCKER-001 harmonisation). Same impl
    // as `ingestDelta` — existing consumers stay working.
    ingest: ingestDelta,
    ingestDelta,
    forceSnapshot,
    resetBook,
    replay,
    setConfig,
    dispose,
  }
}

function validateConfig(c: HeatmapControllerConfig): void {
  if (!(c.tickSize > 0))
    throw new KLineChartError('HEATMAP_CONFIG_INVALID', 'HeatmapController: tickSize must be > 0')
  if (!(c.snapshotIntervalMs > 0)) {
    throw new KLineChartError(
      'HEATMAP_CONFIG_INVALID',
      'HeatmapController: snapshotIntervalMs must be > 0',
    )
  }
  if (!Number.isInteger(c.snapshotRingCapacity) || c.snapshotRingCapacity <= 0) {
    throw new KLineChartError(
      'HEATMAP_CONFIG_INVALID',
      'HeatmapController: snapshotRingCapacity must be a positive integer',
    )
  }
  if (!(c.deltaArchiveMaxSize >= 0)) {
    throw new KLineChartError(
      'HEATMAP_CONFIG_INVALID',
      'HeatmapController: deltaArchiveMaxSize must be ≥ 0',
    )
  }
  if (!(c.logColorRange.sizeMin > 0) || !(c.logColorRange.sizeMax > 0)) {
    throw new KLineChartError(
      'HEATMAP_CONFIG_INVALID',
      'HeatmapController: logColorRange bounds must be positive',
    )
  }
  if (c.logColorRange.sizeMax < c.logColorRange.sizeMin) {
    throw new KLineChartError(
      'HEATMAP_CONFIG_INVALID',
      'HeatmapController: logColorRange.sizeMax must be ≥ sizeMin',
    )
  }
}
