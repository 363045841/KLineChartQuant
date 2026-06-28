import { describe, it, expect } from 'vitest'

import { createHeatmapController } from '../createHeatmapController'
import { createOrderBookState } from '../createOrderBookState'
import type { BookSnapshot, OrderBookDelta } from '../types'

function bid(ts: number, price: number, size: number): OrderBookDelta {
  return { side: 'bid', price, size, timestamp: ts }
}
function ask(ts: number, price: number, size: number): OrderBookDelta {
  return { side: 'ask', price, size, timestamp: ts }
}

function findBidSize(snap: BookSnapshot, price: number): number {
  for (const [p, s] of snap.bids) if (p === price) return s
  return 0
}

describe('createHeatmapController', () => {
  it('auto-generates snapshots at the configured interval driven by delta timestamps', () => {
    const ctrl = createHeatmapController({
      tickSize: 0.01,
      snapshotIntervalMs: 100,
      snapshotRingCapacity: 10,
      deltaArchiveMaxSize: 1000,
      logColorRange: { sizeMin: 1, sizeMax: 1000 },
    })
    // Send 5 deltas spanning 0 → 450ms — 4 interval crossings.
    ctrl.ingestDelta(bid(0, 100, 1))
    ctrl.ingestDelta(bid(150, 100, 2)) // crosses 100ms
    ctrl.ingestDelta(bid(220, 100, 3)) // crosses 200ms
    ctrl.ingestDelta(bid(330, 100, 4)) // crosses 300ms
    ctrl.ingestDelta(bid(450, 100, 5)) // crosses 400ms
    const st = ctrl.state.peek()
    // Each crossing produces one snapshot.
    expect(st.snapshotCount).toBe(4)
    expect(st.deltaCount).toBe(5)
    ctrl.dispose()
  })

  it('records flash orders in the archive even when they vanish before the next snapshot', () => {
    const ctrl = createHeatmapController({
      tickSize: 0.01,
      snapshotIntervalMs: 100,
      snapshotRingCapacity: 10,
      deltaArchiveMaxSize: 1000,
      logColorRange: { sizeMin: 1, sizeMax: 1000 },
    })
    // First delta anchors snapshot clock at t=0.
    ctrl.ingestDelta(bid(0, 100, 1))
    // Place + cancel inside the [0, 100) window.
    ctrl.ingestDelta(bid(10, 99.5, 500)) // flash place
    ctrl.ingestDelta(bid(20, 99.5, 0)) // flash cancel
    // Now cross the interval to fire a snapshot.
    ctrl.ingestDelta(bid(150, 100, 2))
    const st = ctrl.state.peek()
    expect(st.snapshotCount).toBe(1)
    // The forced snapshot should NOT show the flash level (it was cancelled).
    ctrl.forceSnapshot()
    const latest = ctrl.state.peek().latestSnapshot
    expect(latest).not.toBeNull()
    expect(findBidSize(latest as BookSnapshot, 99.5)).toBe(0)
    // But replay across the flash window MUST show it.
    const series = ctrl.replay(5, 25, 5)
    const flashOn = series.find((s) => findBidSize(s, 99.5) === 500)
    const flashOff = series.find((s) => s.timestamp >= 20 && findBidSize(s, 99.5) === 0)
    expect(flashOn).toBeDefined()
    expect(flashOff).toBeDefined()
    ctrl.dispose()
  })

  it('forceSnapshot() pushes the current book state immediately', () => {
    const ctrl = createHeatmapController({
      tickSize: 0.01,
      snapshotIntervalMs: 1000,
      snapshotRingCapacity: 10,
      deltaArchiveMaxSize: 1000,
      logColorRange: { sizeMin: 1, sizeMax: 1000 },
    })
    ctrl.ingestDelta(bid(0, 100, 5))
    ctrl.ingestDelta(ask(0, 101, 7))
    expect(ctrl.state.peek().snapshotCount).toBe(0)
    ctrl.forceSnapshot()
    const st = ctrl.state.peek()
    expect(st.snapshotCount).toBe(1)
    expect(st.latestSnapshot?.bids).toEqual([[100, 5]])
    expect(st.latestSnapshot?.asks).toEqual([[101, 7]])
    ctrl.dispose()
  })

  it('replay(t1,t2) reconstructs the book equivalent to fold-left of deltas', () => {
    // Property-test equivalent: build a fixed delta stream, replay through
    // the controller, and assert the replayed snapshot at every grid
    // timestamp equals the snapshot computed by applying deltas
    // up-to-and-including that timestamp to a fresh order book.
    const ctrl = createHeatmapController({
      tickSize: 0.01,
      snapshotIntervalMs: 50,
      snapshotRingCapacity: 100,
      deltaArchiveMaxSize: 10_000,
      logColorRange: { sizeMin: 1, sizeMax: 1000 },
    })
    const deltas: OrderBookDelta[] = [
      bid(0, 100, 5),
      ask(0, 101, 5),
      bid(40, 99.5, 10),
      ask(60, 101.5, 3),
      bid(75, 100, 0), // remove
      ask(110, 102, 4),
      bid(140, 99.5, 25),
      ask(170, 101, 0),
      bid(190, 99, 1),
    ]
    for (const d of deltas) ctrl.ingestDelta(d)

    const replayed = ctrl.replay(0, 200, 25)

    for (const snap of replayed) {
      const oracle = createOrderBookState({ tickSize: 0.01 })
      for (const d of deltas) {
        if (d.timestamp < snap.timestamp) oracle.applyDelta(d)
      }
      const expected = oracle.snapshot()
      expect(snap.bids).toEqual(expected.bids)
      expect(snap.asks).toEqual(expected.asks)
    }
    ctrl.dispose()
  })

  it('replay across midpoint matches live-state snapshot at that point', () => {
    // Hand-coded equivalence: a known midpoint timestamp must yield the
    // same book state whether reached via live ingest or via replay.
    const cfg = {
      tickSize: 0.01,
      snapshotIntervalMs: 100,
      snapshotRingCapacity: 64,
      deltaArchiveMaxSize: 10_000,
      logColorRange: { sizeMin: 1, sizeMax: 1000 },
    }
    const live = createHeatmapController(cfg)
    const deltas: OrderBookDelta[] = [
      bid(0, 100, 1),
      ask(0, 101, 1),
      bid(50, 99.5, 2),
      bid(120, 100, 0),
      ask(160, 101.5, 4),
    ]
    for (const d of deltas) live.ingestDelta(d)

    // Live midpoint reference: replay BOOK alone, no controller, up to t=80.
    const reference = createOrderBookState({ tickSize: 0.01 })
    for (const d of deltas) if (d.timestamp < 80) reference.applyDelta(d)
    const refSnap = reference.snapshot()

    // Controller-produced replay snapshot at exactly t=80.
    const series = live.replay(80, 80, 1)
    expect(series).toHaveLength(1)
    expect(series[0].bids).toEqual(refSnap.bids)
    expect(series[0].asks).toEqual(refSnap.asks)
    live.dispose()
  })

  it('dispose() silences subsequent mutator calls', () => {
    const ctrl = createHeatmapController({
      tickSize: 0.01,
      snapshotIntervalMs: 100,
      snapshotRingCapacity: 10,
      deltaArchiveMaxSize: 1000,
      logColorRange: { sizeMin: 1, sizeMax: 1000 },
    })
    ctrl.ingestDelta(bid(0, 100, 1))
    const before = ctrl.state.peek().deltaCount
    ctrl.dispose()
    ctrl.ingestDelta(bid(100, 100, 2))
    ctrl.forceSnapshot()
    ctrl.setConfig({ snapshotIntervalMs: 50 })
    expect(ctrl.state.peek().deltaCount).toBe(before)
    // replay() on disposed controller returns empty.
    expect(ctrl.replay(0, 100, 10)).toEqual([])
    // dispose() is idempotent.
    ctrl.dispose()
  })

  it('setConfig() rebuilds book + ring + archive cap when tick/capacity/maxSize change', () => {
    const ctrl = createHeatmapController({
      tickSize: 0.01,
      snapshotIntervalMs: 100,
      snapshotRingCapacity: 4,
      deltaArchiveMaxSize: 1000,
      logColorRange: { sizeMin: 1, sizeMax: 1000 },
    })
    // Three distinct fine prices that all fall inside a single coarse
    // bucket once we re-quantize.
    ctrl.ingestDelta(bid(0, 100.1, 1))
    ctrl.ingestDelta(bid(150, 100.2, 2))
    ctrl.ingestDelta(bid(300, 100.3, 3))
    // Coarser tick: 0.10/0.20/0.30 → ticks 1/2/3 at 0.01, but at 1.0
    // they all round to 100.0.
    ctrl.setConfig({ tickSize: 1.0 })
    ctrl.forceSnapshot()
    const snap = ctrl.state.peek().latestSnapshot as BookSnapshot
    const buckets = new Set(snap.bids.map((b) => b[0]))
    expect(buckets.size).toBe(1)
    expect(snap.bids[0][0]).toBe(100)
    ctrl.dispose()
  })

  it('rejects invalid replay configuration', () => {
    const ctrl = createHeatmapController()
    expect(() => ctrl.replay(0, 100, 0)).toThrow()
    expect(() => ctrl.replay(0, 100, -1)).toThrow()
    // from > to returns empty (not throw).
    expect(ctrl.replay(100, 0, 10)).toEqual([])
    ctrl.dispose()
  })

  it('emits a state notification on every ingestDelta', () => {
    const ctrl = createHeatmapController({
      tickSize: 0.01,
      snapshotIntervalMs: 1_000,
      snapshotRingCapacity: 10,
      deltaArchiveMaxSize: 1000,
      logColorRange: { sizeMin: 1, sizeMax: 1000 },
    })
    let calls = 0
    const off = ctrl.state.subscribe(() => calls++)
    ctrl.ingestDelta(bid(0, 100, 1))
    ctrl.ingestDelta(bid(1, 100, 2))
    ctrl.ingestDelta(bid(2, 100, 3))
    // 3 deltas → 3 notifications.
    expect(calls).toBe(3)
    off()
    ctrl.dispose()
  })

  describe('resetBook', () => {
    it('replaces book state with snapshot, resets ring/archive/clock', () => {
      const ctrl = createHeatmapController({
        tickSize: 0.01,
        snapshotIntervalMs: 100,
        snapshotRingCapacity: 10,
        deltaArchiveMaxSize: 1000,
        logColorRange: { sizeMin: 1, sizeMax: 1000 },
      })
      // Establish some live state.
      ctrl.ingestDelta(bid(0, 100, 1))
      ctrl.ingestDelta(bid(150, 100, 2)) // crosses 100ms → 1 snapshot
      expect(ctrl.state.peek().snapshotCount).toBe(1)
      expect(ctrl.state.peek().deltaCount).toBe(2)

      const snap: BookSnapshot = {
        bids: [[99, 10], [98, 5]],
        asks: [[101, 8]],
        timestamp: 500,
      }
      ctrl.resetBook(snap)

      const st = ctrl.state.peek()
      expect(st.snapshotCount).toBe(0)
      expect(st.deltaCount).toBe(0)
      expect(st.latestSnapshot?.bids).toEqual([[99, 10], [98, 5]])
      expect(st.latestSnapshot?.asks).toEqual([[101, 8]])
      expect(st.latestSnapshot?.timestamp).toBe(500)
      ctrl.dispose()
    })

    it('clears snapshot ring and delta archive', () => {
      const ctrl = createHeatmapController({
        tickSize: 0.01,
        snapshotIntervalMs: 100,
        snapshotRingCapacity: 10,
        deltaArchiveMaxSize: 1000,
        logColorRange: { sizeMin: 1, sizeMax: 1000 },
      })
      // Ingest enough to create snapshots in the ring.
      ctrl.ingestDelta(bid(0, 100, 1))
      ctrl.ingestDelta(bid(150, 100, 2))
      ctrl.ingestDelta(bid(250, 100, 3))
      // Snapshots at 100 and 200.
      expect(ctrl.state.peek().snapshotCount).toBe(2)

      // Replay must return something before reset.
      const beforeReplay = ctrl.replay(0, 250, 50)
      expect(beforeReplay.length).toBeGreaterThan(0)

      ctrl.resetBook({
        bids: [[100, 5]],
        asks: [[101, 3]],
        timestamp: 300,
      })

      // Ring is cleared.
      expect(ctrl.state.peek().snapshotCount).toBe(0)
      // Archive is cleared — replay produces skeleton snapshots (empty book).
      const after = ctrl.replay(0, 500, 50)
      expect(after.length).toBeGreaterThan(0)
      for (const snap of after) {
        expect(snap.bids).toEqual([])
        expect(snap.asks).toEqual([])
      }
      ctrl.dispose()
    })

    it('resets snapshot clock so next ingest anchors fresh', () => {
      const ctrl = createHeatmapController({
        tickSize: 0.01,
        snapshotIntervalMs: 100,
        snapshotRingCapacity: 10,
        deltaArchiveMaxSize: 1000,
        logColorRange: { sizeMin: 1, sizeMax: 1000 },
      })
      ctrl.ingestDelta(bid(0, 100, 1))
      // Clock at 0. Next delta at 50 should NOT trigger snapshot (not past
      // interval). But after resetBook, the clock resets so the next delta
      // anchors anew.
      ctrl.resetBook({
        bids: [[100, 5]],
        asks: [[101, 3]],
        timestamp: 200,
      })
      // Delta at 250 — clock was reset to null, so this anchors at 250
      // and should NOT produce a snapshot (first delta never does).
      ctrl.ingestDelta(bid(250, 100, 2))
      expect(ctrl.state.peek().snapshotCount).toBe(0)

      // Now a delta at 400 crosses 100ms from anchor → 1 snapshot.
      ctrl.ingestDelta(bid(400, 100, 3))
      expect(ctrl.state.peek().snapshotCount).toBe(1)
      ctrl.dispose()
    })

    it('resetBook ingests the snapshot as deltas into the book', () => {
      const ctrl = createHeatmapController({
        tickSize: 0.5,
        snapshotIntervalMs: 1000,
        snapshotRingCapacity: 10,
        deltaArchiveMaxSize: 1000,
        logColorRange: { sizeMin: 1, sizeMax: 1000 },
      })
      // Tick size 0.5 means 100.25 → 100.0.
      ctrl.resetBook({
        bids: [[100.25, 7]],
        asks: [[101.0, 4]],
        timestamp: 10,
      })
      const st = ctrl.state.peek()
      // tickSize 0.5: 100.25 → index 201 → dequantized 100.5
      expect(st.latestSnapshot?.bids).toEqual([[100.5, 7]])
      expect(st.latestSnapshot?.asks).toEqual([[101.0, 4]])
      ctrl.dispose()
    })

    it('disposed controller silently ignores resetBook', () => {
      const ctrl = createHeatmapController()
      ctrl.dispose()
      ctrl.resetBook({
        bids: [[100, 5]],
        asks: [[101, 3]],
        timestamp: 1,
      })
      expect(ctrl.state.peek().latestSnapshot).toBeNull()
    })
  })
})
