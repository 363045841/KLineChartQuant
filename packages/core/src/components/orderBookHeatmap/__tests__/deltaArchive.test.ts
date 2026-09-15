import { describe, expect, it } from 'vitest'

import { createDeltaArchive } from '../deltaArchive'
import type { OrderBookDelta } from '../types'

function delta(ts: number, price = 100, size = 1): OrderBookDelta {
  return { side: 'bid', price, size, timestamp: ts }
}

describe('createDeltaArchive', () => {
  it('appends + ranges across the inserted window', () => {
    const a = createDeltaArchive()
    for (let i = 0; i < 10; i++) a.append(delta(i))
    const r = a.range(2, 5)
    expect(r.map((d) => d.timestamp)).toEqual([2, 3, 4, 5])
  })

  it('range bounds are inclusive on both ends', () => {
    const a = createDeltaArchive()
    a.append(delta(10))
    a.append(delta(20))
    a.append(delta(30))
    expect(a.range(10, 30).map((d) => d.timestamp)).toEqual([10, 20, 30])
    expect(a.range(11, 29).map((d) => d.timestamp)).toEqual([20])
  })

  it('trim drops the oldest entries until size ≤ target', () => {
    const a = createDeltaArchive()
    for (let i = 0; i < 100; i++) a.append(delta(i))
    a.trim(30)
    expect(a.size()).toBe(30)
    // The 30 newest should remain.
    const all = a.range(0, 999)
    expect(all[0].timestamp).toBe(70)
    expect(all[all.length - 1].timestamp).toBe(99)
  })

  it('reports accurate size after append, trim, and clear', () => {
    const a = createDeltaArchive()
    expect(a.size()).toBe(0)
    for (let i = 0; i < 5; i++) a.append(delta(i))
    expect(a.size()).toBe(5)
    a.trim(2)
    expect(a.size()).toBe(2)
    a.clear()
    expect(a.size()).toBe(0)
  })

  it('chunked storage does not break range queries across chunks', () => {
    // CHUNK_SIZE is 10_000 in the impl. Push more than that to force at
    // least one chunk boundary and ensure ordering still holds.
    const a = createDeltaArchive()
    const N = 25_000
    for (let i = 0; i < N; i++) a.append(delta(i))
    // Window straddles two chunk boundaries.
    const r = a.range(9_998, 10_002)
    expect(r.map((d) => d.timestamp)).toEqual([9_998, 9_999, 10_000, 10_001, 10_002])
    // Full range returns every delta exactly once.
    const all = a.range(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY)
    expect(all.length).toBe(N)
    expect(all[0].timestamp).toBe(0)
    expect(all[N - 1].timestamp).toBe(N - 1)
  })

  it('respects maxSize at construction by auto-trimming on append', () => {
    const a = createDeltaArchive({ maxSize: 5 })
    for (let i = 0; i < 12; i++) a.append(delta(i))
    expect(a.size()).toBe(5)
    const all = a.range(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY)
    expect(all.map((d) => d.timestamp)).toEqual([7, 8, 9, 10, 11])
  })

  it('returns empty array when from > to', () => {
    const a = createDeltaArchive()
    for (let i = 0; i < 5; i++) a.append(delta(i))
    expect(a.range(3, 1)).toEqual([])
  })

  it('clear() resets the archive without breaking subsequent appends', () => {
    const a = createDeltaArchive()
    for (let i = 0; i < 5; i++) a.append(delta(i))
    a.clear()
    expect(a.size()).toBe(0)
    a.append(delta(99))
    expect(a.size()).toBe(1)
    expect(a.range(0, 1000).map((d) => d.timestamp)).toEqual([99])
  })
})
