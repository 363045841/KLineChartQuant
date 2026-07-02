/**
 * Fixed-capacity ring buffer of recent book snapshots.
 *
 * Live render path: the heatmap shader samples a 2-D grid of intensity
 * values keyed by (column = snapshot index, row = price). The ring stores
 * the columns. Capacity is chosen so that ring duration covers the visible
 * heatmap window — e.g. 600 entries @ 100 ms cadence = 60 s.
 *
 * Storage is a pre-allocated array with a head pointer; older entries are
 * overwritten in place once full. `toArray()` walks the ring in
 * oldest → newest order so consumers can upload it as a single contiguous
 * GPU buffer.
 */

import { KLineChartError } from '../../errors'

import type { BookSnapshot, SnapshotRing } from './types'

export function createSnapshotRing(capacity: number): SnapshotRing {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new KLineChartError(
      'HEATMAP_CONFIG_INVALID',
      'createSnapshotRing: capacity must be a positive integer',
    )
  }
  const cap = capacity
  const slots: Array<BookSnapshot | null> = new Array(cap).fill(null)
  let head = 0 // index of the next write slot
  let count = 0 // number of populated slots; saturates at cap

  function push(snapshot: BookSnapshot): void {
    slots[head] = snapshot
    head = (head + 1) % cap
    if (count < cap) count++
  }

  function toArray(): ReadonlyArray<BookSnapshot> {
    if (count === 0) return []
    const out: BookSnapshot[] = new Array(count)
    // Oldest index when full = head (next write slot); when not full = 0.
    const start = count < cap ? 0 : head
    for (let i = 0; i < count; i++) {
      const slot = slots[(start + i) % cap]
      // Guarded above by count; slots[(start+i)%cap] is non-null.
      out[i] = slot as BookSnapshot
    }
    return out
  }

  function size(): number {
    return count
  }

  function clear(): void {
    for (let i = 0; i < cap; i++) slots[i] = null
    head = 0
    count = 0
  }

  return {
    get capacity() {
      return cap
    },
    push,
    toArray,
    size,
    clear,
  }
}
