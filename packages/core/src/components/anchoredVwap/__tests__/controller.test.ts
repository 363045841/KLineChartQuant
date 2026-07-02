/**
 * Tests for `createAnchoredVwapController` — multi-anchor reactive surface.
 *
 * The controller is held to three behavioural contracts:
 *   1. Signals fire on every structural change (add, remove, update,
 *      setBars, appendBar).
 *   2. The incremental `appendBar` is bit-for-bit equivalent (to
 *      floating-point precision) to a fresh `computeAnchoredVwap` over
 *      the same bars. The MAX_INCREMENTAL_DELTA assertion below is the
 *      reported delta in the summary.
 *   3. `dispose` makes every mutator a silent no-op.
 */

import { describe, it, expect } from 'vitest'

import { computeAnchoredVwap } from '../computeAnchoredVwap'
import { createAnchoredVwapController } from '../createAnchoredVwapController'
import type { AnchorDefinition, AVWAPBar } from '../types'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function bar(high: number, low: number, close: number, volume: number): AVWAPBar {
  return { high, low, close, volume }
}

/** Realistic-ish trending series with mixed volume for the equivalence test. */
function makeSeries(n: number, seed = 1): AVWAPBar[] {
  const out: AVWAPBar[] = []
  let price = 100
  // Tiny deterministic PRNG — keeps the fixture reproducible without
  // a dependency.
  let s = seed
  const rand = (): number => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
  for (let i = 0; i < n; i++) {
    const drift = (rand() - 0.5) * 2
    price = Math.max(1, price + drift)
    const high = price + rand() * 1.5
    const low = price - rand() * 1.5
    const close = low + rand() * (high - low)
    const volume = 100 + Math.floor(rand() * 10_000)
    out.push(bar(high, low, close, volume))
  }
  return out
}

function defaultAnchor(id: string, barIndex: number, includeBands = true): AnchorDefinition {
  return { id, label: id, barIndex, includeBands }
}

// ---------------------------------------------------------------------------
// addAnchor / signal contract
// ---------------------------------------------------------------------------

describe('createAnchoredVwapController — addAnchor + signal', () => {
  it('addAnchor returns the supplied id and fires the anchors signal', () => {
    const bars = makeSeries(10)
    const c = createAnchoredVwapController({ initialBars: bars })

    // Subscribe BEFORE calling addAnchor — we want to confirm the
    // notification happens as a result of the mutation.
    let notifications = 0
    const unsub = c.anchors.subscribe(() => {
      notifications += 1
    })

    const returnedId = c.addAnchor(defaultAnchor('a1', 2))
    expect(returnedId).toBe('a1')

    const state = c.anchors.peek()
    expect(state).toHaveLength(1)
    expect(state[0]!.definition.id).toBe('a1')
    // The series should span bars 2..9 inclusive.
    expect(state[0]!.series).toHaveLength(8)
    expect(state[0]!.series[0]!.barIndex).toBe(2)
    expect(state[0]!.series[7]!.barIndex).toBe(9)

    expect(notifications).toBeGreaterThanOrEqual(1)

    unsub()
    c.dispose()
  })

  it('addAnchor with a duplicate id REPLACES the existing anchor', () => {
    // We document this choice in the test name. The brief allows
    // either reject-or-replace; we picked replace because UIs that
    // drag an anchor onto an existing one expect in-place update.
    const bars = makeSeries(10)
    const c = createAnchoredVwapController({ initialBars: bars })

    c.addAnchor(defaultAnchor('a1', 2))
    const firstSeriesLen = c.anchors.peek()[0]!.series.length

    // Same id, different bar index → must replace, not insert a
    // second entry.
    c.addAnchor(defaultAnchor('a1', 5))
    const after = c.anchors.peek()
    expect(after).toHaveLength(1)
    expect(after[0]!.definition.barIndex).toBe(5)
    // The new series is shorter because it starts later.
    expect(after[0]!.series.length).toBeLessThan(firstSeriesLen)
    expect(after[0]!.series[0]!.barIndex).toBe(5)

    c.dispose()
  })
})

// ---------------------------------------------------------------------------
// removeAnchor
// ---------------------------------------------------------------------------

describe('createAnchoredVwapController — removeAnchor', () => {
  it('removeAnchor returns false for an unknown id and does not emit', () => {
    const bars = makeSeries(10)
    const c = createAnchoredVwapController({ initialBars: bars })
    c.addAnchor(defaultAnchor('a1', 2))

    let notifications = 0
    const unsub = c.anchors.subscribe(() => {
      notifications += 1
    })

    expect(c.removeAnchor('nope')).toBe(false)
    // No mutation happened → no notification.
    expect(notifications).toBe(0)
    // Existing anchor untouched.
    expect(c.anchors.peek()).toHaveLength(1)

    unsub()
    c.dispose()
  })

  it('removeAnchor returns true for a known id and drops it from the signal', () => {
    const bars = makeSeries(10)
    const c = createAnchoredVwapController({ initialBars: bars })
    c.addAnchor(defaultAnchor('a1', 2))
    c.addAnchor(defaultAnchor('a2', 5))
    expect(c.anchors.peek()).toHaveLength(2)

    expect(c.removeAnchor('a1')).toBe(true)
    const after = c.anchors.peek()
    expect(after).toHaveLength(1)
    expect(after[0]!.definition.id).toBe('a2')

    c.dispose()
  })
})

// ---------------------------------------------------------------------------
// updateAnchor
// ---------------------------------------------------------------------------

describe('createAnchoredVwapController — updateAnchor', () => {
  it('moving an anchor barIndex recomputes the series', () => {
    const bars = makeSeries(20)
    const c = createAnchoredVwapController({ initialBars: bars })
    c.addAnchor(defaultAnchor('a1', 3))

    const before = c.anchors.peek()[0]!.series
    const beforeLen = before.length
    const beforeFirstVwap = before[0]!.vwap

    expect(c.updateAnchor('a1', { barIndex: 10 })).toBe(true)
    const after = c.anchors.peek()[0]!
    // Series shrunk because the anchor moved forward.
    expect(after.series).toHaveLength(beforeLen - 7)
    expect(after.series[0]!.barIndex).toBe(10)
    // The first vwap differs because it now reflects a different
    // typical price.
    expect(after.series[0]!.vwap).not.toBe(beforeFirstVwap)
    expect(after.definition.barIndex).toBe(10)

    c.dispose()
  })

  it('updateAnchor on an unknown id returns false', () => {
    const c = createAnchoredVwapController({ initialBars: makeSeries(5) })
    expect(c.updateAnchor('ghost', { label: 'hi' })).toBe(false)
    c.dispose()
  })

  it('updateAnchor label-only does not change the math', () => {
    const c = createAnchoredVwapController({ initialBars: makeSeries(10) })
    c.addAnchor(defaultAnchor('a1', 2))
    const before = c.anchors.peek()[0]!.series
    c.updateAnchor('a1', { label: 'new label' })
    const after = c.anchors.peek()[0]!
    expect(after.definition.label).toBe('new label')
    // Series is structurally identical (same length, same vwap values).
    expect(after.series).toHaveLength(before.length)
    for (let i = 0; i < before.length; i++) {
      expect(after.series[i]!.vwap).toBe(before[i]!.vwap)
    }
    c.dispose()
  })
})

// ---------------------------------------------------------------------------
// setBars
// ---------------------------------------------------------------------------

describe('createAnchoredVwapController — setBars', () => {
  it('setBars rebuilds every anchor series', () => {
    const c = createAnchoredVwapController({ initialBars: makeSeries(10) })
    c.addAnchor(defaultAnchor('a1', 2))
    c.addAnchor(defaultAnchor('a2', 5))
    const before = c.anchors.peek().map((a) => a.series.length)

    // Larger bar set → both series should grow.
    c.setBars(makeSeries(30, 99))
    const after = c.anchors.peek().map((a) => a.series.length)
    // a1 was anchored at 2 → previously 8 points, now 28.
    expect(after[0]).toBe(28)
    // a2 was anchored at 5 → previously 5 points, now 25.
    expect(after[1]).toBe(25)
    // Both grew.
    expect(after[0]).toBeGreaterThan(before[0]!)
    expect(after[1]).toBeGreaterThan(before[1]!)
    c.dispose()
  })
})

// ---------------------------------------------------------------------------
// appendBar — the perf optimisation
// ---------------------------------------------------------------------------

describe('createAnchoredVwapController — appendBar', () => {
  it('extends every active anchor series by exactly one point', () => {
    const c = createAnchoredVwapController({ initialBars: makeSeries(5) })
    c.addAnchor(defaultAnchor('a1', 1))
    c.addAnchor(defaultAnchor('a2', 3))
    const before = c.anchors.peek().map((a) => a.series.length)

    c.appendBar(bar(110, 108, 109, 500))

    const after = c.anchors.peek()
    for (let i = 0; i < after.length; i++) {
      expect(after[i]!.series.length).toBe(before[i]! + 1)
      const last = after[i]!.series[after[i]!.series.length - 1]!
      // New point references the just-appended bar.
      expect(last.barIndex).toBe(5)
    }
    c.dispose()
  })

  it('appendBar incrementally matches a full computeAnchoredVwap recompute', () => {
    // The headline performance contract: walking via N appendBar
    // calls must produce the same series as a single
    // computeAnchoredVwap over the final bars. We pin the max delta
    // here at 1e-9 (we measure 0 in practice — the operands are
    // added in the same order) so a regression to a different
    // accumulation order would fail loudly.
    const initial = makeSeries(20)
    const tail = makeSeries(30, 42)
    const all = [...initial, ...tail]

    const c = createAnchoredVwapController({ initialBars: initial })
    c.addAnchor(defaultAnchor('a-bands', 5, true))
    c.addAnchor(defaultAnchor('a-no-bands', 12, false))

    for (const b of tail) c.appendBar(b)

    const incrementalAnchors = c.anchors.peek()
    const referenceBands = computeAnchoredVwap(all, 5, true)
    const referenceNoBands = computeAnchoredVwap(all, 12, false)

    const compare = (
      label: string,
      inc: ReadonlyArray<{
        vwap: number
        upper1: number
        lower1: number
        upper2: number
        lower2: number
        cumulativeVolume: number
        barIndex: number
      }>,
      ref: ReadonlyArray<{
        vwap: number
        upper1: number
        lower1: number
        upper2: number
        lower2: number
        cumulativeVolume: number
        barIndex: number
      }>,
    ): number => {
      expect(inc.length, `${label} length`).toBe(ref.length)
      let maxDelta = 0
      for (let i = 0; i < inc.length; i++) {
        const a = inc[i]!
        const b = ref[i]!
        expect(a.barIndex).toBe(b.barIndex)
        const fields: Array<keyof typeof a> = [
          'vwap',
          'upper1',
          'lower1',
          'upper2',
          'lower2',
          'cumulativeVolume',
        ]
        for (const f of fields) {
          const av = a[f]
          const bv = b[f]
          if (Number.isNaN(av) && Number.isNaN(bv)) continue
          const d = Math.abs((av as number) - (bv as number))
          if (d > maxDelta) maxDelta = d
        }
      }
      return maxDelta
    }

    const deltaBands = compare('bands', incrementalAnchors[0]!.series, referenceBands)
    const deltaNoBands = compare('no-bands', incrementalAnchors[1]!.series, referenceNoBands)
    const maxDelta = Math.max(deltaBands, deltaNoBands)

    // Hard limit: 1e-9. Empirically we see exact 0 because the
    // arithmetic is identical between the two paths — same operands
    // added in the same order. The 1e-9 limit gives a tolerance to
    // a future refactor that reorders summation, while still
    // catching a meaningful divergence.
    expect(maxDelta).toBeLessThan(1e-9)
    // A stricter, observation-pinning assertion: today we see EXACT
    // bit-for-bit equality. Keeping this assertion as documentation
    // of the current invariant; a future refactor that reorders
    // summation should consciously decide to relax it.
    expect(maxDelta).toBe(0)

    c.dispose()
  })

  it('appendBar emits a notification per call', () => {
    const c = createAnchoredVwapController({ initialBars: makeSeries(5) })
    c.addAnchor(defaultAnchor('a1', 0))
    let notifications = 0
    const unsub = c.anchors.subscribe(() => {
      notifications += 1
    })
    c.appendBar(bar(110, 108, 109, 500))
    c.appendBar(bar(111, 109, 110, 500))
    c.appendBar(bar(112, 110, 111, 500))
    expect(notifications).toBe(3)
    unsub()
    c.dispose()
  })
})

// ---------------------------------------------------------------------------
// Independence of multiple anchors
// ---------------------------------------------------------------------------

describe('createAnchoredVwapController — multiple anchors', () => {
  it('two anchors at different positions produce independent series', () => {
    const bars = makeSeries(15)
    const c = createAnchoredVwapController({ initialBars: bars })
    c.addAnchor(defaultAnchor('early', 2))
    c.addAnchor(defaultAnchor('late', 10))

    const list = c.anchors.peek()
    expect(list).toHaveLength(2)
    // Early anchor covers more bars.
    expect(list[0]!.series.length).toBeGreaterThan(list[1]!.series.length)
    // First bar index of each series matches its anchor.
    expect(list[0]!.series[0]!.barIndex).toBe(2)
    expect(list[1]!.series[0]!.barIndex).toBe(10)
    // Removing one does not affect the other.
    c.removeAnchor('early')
    const after = c.anchors.peek()
    expect(after).toHaveLength(1)
    expect(after[0]!.definition.id).toBe('late')
    c.dispose()
  })
})

// ---------------------------------------------------------------------------
// Dispose
// ---------------------------------------------------------------------------

describe('createAnchoredVwapController — dispose', () => {
  it('dispose silences subsequent mutators', () => {
    const c = createAnchoredVwapController({ initialBars: makeSeries(5) })
    c.addAnchor(defaultAnchor('a1', 0))

    let notifications = 0
    const unsub = c.anchors.subscribe(() => {
      notifications += 1
    })

    c.dispose()
    // dispose is idempotent.
    c.dispose()

    // Every mutator becomes a no-op with the documented fallback.
    expect(c.addAnchor(defaultAnchor('a2', 1))).toBeNull()
    expect(c.removeAnchor('a1')).toBe(false)
    expect(c.updateAnchor('a1', { label: 'no' })).toBe(false)
    c.appendBar(bar(110, 108, 109, 500))
    c.setBars(makeSeries(8))

    expect(notifications).toBe(0)
    // Underlying state was not modified by any of those calls.
    expect(c.anchors.peek()).toHaveLength(1)
    expect(c.anchors.peek()[0]!.definition.id).toBe('a1')

    unsub()
  })
})
