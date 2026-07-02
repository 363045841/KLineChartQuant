/**
 * Order Book L2 — applyDelta hot path + snapshot cost.
 *
 * Goal numbers (ROADMAP §3.2 motivation): Binance BTC perp delivers ~1000
 * delta updates per second per side. We want:
 *   applyDelta:        target < 1 µs per call
 *   snapshot():        target < 1 ms at 500-level book (one frame budget)
 *
 * The dual-path architecture (snapshot ring + delta archive) means these
 * bench numbers feed two consumers — the live render path (snapshot every
 * 100 ms = 6 frames worth of deltas accumulated) and the replay path
 * (millions of deltas fast-folded).
 */

import { describe, bench } from 'vitest'

import { createOrderBookState } from '../components/orderBookHeatmap/createOrderBookState'
import type { OrderBookDelta } from '../components/orderBookHeatmap/types'

const TICK = 0.01

// Pre-build a realistic delta stream: roughly symmetric around mid 100,
// 60% small-quantity updates and 40% larger ones, with occasional level
// removals (size = 0). 100k deltas exercises the Map churn + lazy sort.
function makeDeltas(n: number, seed = 1): OrderBookDelta[] {
  let rng = seed
  const rand = (): number => {
    rng = (rng * 1664525 + 1013904223) >>> 0
    return rng / 0xffffffff
  }
  const out = new Array(n)
  const baseTs = 1_700_000_000_000
  for (let i = 0; i < n; i++) {
    const side: 'bid' | 'ask' = rand() < 0.5 ? 'bid' : 'ask'
    const off = (rand() - 0.5) * 4
    const price = side === 'bid' ? 99.95 + off : 100.05 + off
    const size = rand() < 0.05 ? 0 : rand() < 0.6 ? rand() * 10 : rand() * 1000
    out[i] = { side, price, size, timestamp: baseTs + i * 1 }
  }
  return out
}

const deltas10k = makeDeltas(10_000)
const deltas100k = makeDeltas(100_000)

describe('OrderBookState — applyDelta hot path', () => {
  bench('10k deltas', () => {
    const book = createOrderBookState({ tickSize: TICK })
    for (const d of deltas10k) book.applyDelta(d)
  })

  bench('100k deltas', () => {
    const book = createOrderBookState({ tickSize: TICK })
    for (const d of deltas100k) book.applyDelta(d)
  })
})

describe('OrderBookState — snapshot at 500-level book', () => {
  // Build the book to ~500 levels per side, then time the snapshot.
  const preFilled = createOrderBookState({ tickSize: TICK })
  for (let i = 0; i < 500; i++) {
    preFilled.applyDelta({ side: 'bid', price: 100 - i * TICK, size: 1 + i * 0.1, timestamp: i })
    preFilled.applyDelta({ side: 'ask', price: 100 + i * TICK, size: 1 + i * 0.1, timestamp: i })
  }

  bench('snapshot()', () => {
    preFilled.snapshot()
  })
})
