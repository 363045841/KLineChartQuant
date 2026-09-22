import { describe, expect, it } from 'vitest'

import { createSnapshotRing } from '../impl/snapshotRing'
import type { BookSnapshot } from '../types'

function makeSnap(ts: number): BookSnapshot {
  return { bids: [], asks: [], timestamp: ts }
}

describe('createSnapshotRing', () => {
  it('respects the declared capacity and reports size accurately', () => {
    const ring = createSnapshotRing(3)
    expect(ring.capacity).toBe(3)
    expect(ring.size()).toBe(0)
    ring.push(makeSnap(1))
    ring.push(makeSnap(2))
    expect(ring.size()).toBe(2)
  })

  it('drops the oldest entry when pushed past capacity', () => {
    const ring = createSnapshotRing(3)
    ring.push(makeSnap(1))
    ring.push(makeSnap(2))
    ring.push(makeSnap(3))
    ring.push(makeSnap(4))
    const out = ring.toArray()
    expect(out.map((s) => s.timestamp)).toEqual([2, 3, 4])
  })

  it('toArray returns snapshots oldest → newest, even after wrap-around', () => {
    const ring = createSnapshotRing(4)
    for (let i = 1; i <= 10; i++) ring.push(makeSnap(i))
    const out = ring.toArray()
    expect(out.map((s) => s.timestamp)).toEqual([7, 8, 9, 10])
  })

  it('clear() empties the buffer without affecting capacity', () => {
    const ring = createSnapshotRing(2)
    ring.push(makeSnap(1))
    ring.push(makeSnap(2))
    ring.clear()
    expect(ring.size()).toBe(0)
    expect(ring.toArray()).toEqual([])
    ring.push(makeSnap(3))
    expect(ring.toArray().map((s) => s.timestamp)).toEqual([3])
  })

  it('rejects non-positive capacity', () => {
    expect(() => createSnapshotRing(0)).toThrow()
    expect(() => createSnapshotRing(-5)).toThrow()
    expect(() => createSnapshotRing(1.5)).toThrow()
  })
})
