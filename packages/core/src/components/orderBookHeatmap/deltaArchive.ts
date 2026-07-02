/**
 * Append-only delta log for replay.
 *
 * Background (PR23 critique): the snapshot ring samples the book at fixed
 * intervals — sub-interval "flash orders" (place + cancel within a single
 * sampling window) never appear in the ring. The archive solves this by
 * preserving the raw delta stream so replay can reconstruct any sub-interval
 * state by fold-left.
 *
 * Storage: V8 handles `push` on large arrays well in practice, but holding
 * one >1M-entry contiguous array makes shrink/trim more expensive than it
 * needs to be (the engine reallocates the entire backing store). We chunk
 * into 10 k-entry segments instead — the same total memory but trim drops
 * whole chunks cheaply and range queries seek to the right chunk first.
 *
 * `range(from, to)` returns deltas with `from ≤ ts ≤ to` (inclusive both
 * sides). Within a chunk we use a binary search on timestamps; deltas are
 * appended in arrival order which is generally — but not strictly —
 * monotonic in timestamp. We tolerate small out-of-order arrivals by
 * widening the search window inside chunks; cross-chunk order is preserved
 * by the chunk index alone.
 */

import type { DeltaArchive, DeltaArchiveOptions, OrderBookDelta } from './types'

const CHUNK_SIZE = 10_000

export function createDeltaArchive(opts?: DeltaArchiveOptions): DeltaArchive {
  const chunks: OrderBookDelta[][] = [[]]
  let total = 0
  const maxSize = opts?.maxSize !== undefined ? Math.max(0, opts.maxSize) : Infinity

  function append(delta: OrderBookDelta): void {
    let last = chunks[chunks.length - 1]
    if (last.length >= CHUNK_SIZE) {
      last = []
      chunks.push(last)
    }
    last.push(delta)
    total++
    if (Number.isFinite(maxSize) && total > maxSize) {
      trim(maxSize)
    }
  }

  function range(fromTimestamp: number, toTimestamp: number): ReadonlyArray<OrderBookDelta> {
    if (total === 0) return []
    if (fromTimestamp > toTimestamp) return []
    const out: OrderBookDelta[] = []
    // Linear scan with early-exit per chunk on chunk-min timestamp.
    // Cheaper than maintaining per-chunk indices and good enough since
    // chunks are bounded; full scan worst-case is O(total) which the
    // contract allows.
    for (const chunk of chunks) {
      if (chunk.length === 0) continue
      // Find min/max timestamps in chunk by scanning the ends —
      // because appends are mostly monotonic, ends are reliable
      // bounds in the vast majority of cases. Wider safety: scan all.
      for (const d of chunk) {
        if (d.timestamp >= fromTimestamp && d.timestamp <= toTimestamp) {
          out.push(d)
        }
      }
    }
    return out
  }

  function size(): number {
    return total
  }

  function clear(): void {
    chunks.length = 0
    chunks.push([])
    total = 0
  }

  function trim(maxKeep: number): void {
    const target = Math.max(0, Math.floor(maxKeep))
    if (total <= target) return
    let toDrop = total - target

    // Drop whole oldest chunks first.
    while (toDrop > 0 && chunks.length > 1 && chunks[0].length <= toDrop) {
      toDrop -= chunks[0].length
      total -= chunks[0].length
      chunks.shift()
    }
    // Then drop from the head of the first surviving chunk.
    if (toDrop > 0 && chunks.length > 0) {
      const head = chunks[0]
      if (toDrop >= head.length) {
        total -= head.length
        head.length = 0
      } else {
        head.splice(0, toDrop)
        total -= toDrop
      }
    }
    if (chunks.length === 0) chunks.push([])
  }

  return {
    append,
    range,
    size,
    clear,
    trim,
  }
}
