/**
 * Tests for `createFrameBudget`.
 *
 * The clock is injected via `opts.now`, so timing assertions are exact:
 * we advance a counter manually and the scheduler reads from it.
 *
 * Coverage:
 *   1. Construction validates targetMs / historySize / maxQueueSize.
 *   2. submit:
 *      - rejects empty id with KLineChartError(INVALID_PARAM)
 *      - queues into correct priority tier (queueDepth updates)
 *      - coalesces same-id submission (the later wins)
 *      - re-buckets when coalesce changes priority
 *      - drops oldest low/medium under maxQueueSize pressure
 *      - never drops high under pressure
 *   3. flush:
 *      - runs all queued tasks if deadline is generous
 *      - stops at deadline (remaining stay queued)
 *      - runs high before medium before low (priority ordering)
 *      - within a tier, FIFO
 *      - returns the number of tasks run
 *      - throw in task is caught + dropped, others continue
 *   4. beginFrame / endFrame:
 *      - validate finite timestamps
 *      - recentFrameMs is the rolling average over historySize frames
 *      - overruns increments only when dur > targetMs
 *   5. clear / dispose.
 */

import { describe, it, expect } from 'vitest'

import { createFrameBudget, type FrameTask } from '..'
import { isKLineChartError } from '../../../errors'

function fakeClock(): {
  now: () => number
  advance: (ms: number) => void
  set: (t: number) => void
} {
  let t = 0
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms
    },
    set: (next: number) => {
      t = next
    },
  }
}

function record(
  id: string,
  store: string[],
  priority: FrameTask['priority'] = 'medium',
): FrameTask {
  return { id, priority, work: () => store.push(id) }
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe('createFrameBudget — validation', () => {
  it('rejects non-positive targetMs', () => {
    for (const v of [0, -1, Number.NaN]) {
      try {
        createFrameBudget({ targetMs: v })
        expect.fail(`expected throw for ${v}`)
      } catch (e) {
        expect(isKLineChartError(e, 'INVALID_PARAM')).toBe(true)
      }
    }
  })

  it('rejects non-positive-integer historySize', () => {
    for (const v of [0, -1, 1.5]) {
      try {
        createFrameBudget({ historySize: v })
        expect.fail(`expected throw for ${v}`)
      } catch (e) {
        expect(isKLineChartError(e, 'INVALID_PARAM')).toBe(true)
      }
    }
  })

  it('rejects non-positive-integer maxQueueSize', () => {
    try {
      createFrameBudget({ maxQueueSize: 0 })
      expect.fail('expected throw')
    } catch (e) {
      expect(isKLineChartError(e, 'INVALID_PARAM')).toBe(true)
    }
  })

  it('exposes targetMs verbatim', () => {
    expect(createFrameBudget({ targetMs: 8 }).targetMs).toBe(8)
  })
})

// ---------------------------------------------------------------------------
// submit
// ---------------------------------------------------------------------------

describe('submit', () => {
  it('rejects empty id', () => {
    const fb = createFrameBudget()
    try {
      fb.submit({ id: '', priority: 'low', work: () => {} })
      expect.fail('expected throw')
    } catch (e) {
      expect(isKLineChartError(e, 'INVALID_PARAM')).toBe(true)
    }
  })

  it('queueDepth tracks submissions across tiers', () => {
    const fb = createFrameBudget()
    const seen: string[] = []
    fb.submit(record('a', seen, 'high'))
    fb.submit(record('b', seen, 'medium'))
    fb.submit(record('c', seen, 'low'))
    expect(fb.queueDepth.peek()).toBe(3)
  })

  it('coalesces same-id submission (later wins)', () => {
    const fb = createFrameBudget()
    const seen: string[] = []
    fb.submit({ id: 'x', priority: 'low', work: () => seen.push('first') })
    fb.submit({ id: 'x', priority: 'low', work: () => seen.push('second') })
    const clk = fakeClock()
    // Cheap test: a fresh budget with default now — flush with a far deadline.
    fb.flush(Number.POSITIVE_INFINITY)
    expect(seen).toEqual(['second'])
  })

  it('re-buckets when coalesce changes priority', () => {
    const seen: string[] = []
    const fb = createFrameBudget({ now: fakeClock().now })
    fb.submit({ id: 'x', priority: 'low', work: () => seen.push('low') })
    fb.submit({ id: 'x', priority: 'high', work: () => seen.push('high') })
    fb.submit(record('y', seen, 'medium'))
    fb.flush(Number.POSITIVE_INFINITY)
    // x runs first (it's now high), then y.
    expect(seen).toEqual(['high', 'y'])
  })

  it('drops oldest low under maxQueueSize pressure', () => {
    const seen: string[] = []
    const fb = createFrameBudget({ maxQueueSize: 2 })
    fb.submit(record('a', seen, 'low'))
    fb.submit(record('b', seen, 'low'))
    fb.submit(record('c', seen, 'high'))
    fb.flush(Number.POSITIVE_INFINITY)
    // 'a' was the oldest low; it got dropped to make room for 'c'.
    expect(seen).toEqual(['c', 'b'])
  })

  it('never drops high under pressure', () => {
    const seen: string[] = []
    const fb = createFrameBudget({ maxQueueSize: 2 })
    fb.submit(record('a', seen, 'high'))
    fb.submit(record('b', seen, 'high'))
    fb.submit(record('c', seen, 'high'))
    fb.flush(Number.POSITIVE_INFINITY)
    // All 3 high tasks present; the cap was exceeded but high
    // is never dropped (producer-is-misbehaving signal).
    expect(seen).toEqual(['a', 'b', 'c'])
  })
})

// ---------------------------------------------------------------------------
// flush
// ---------------------------------------------------------------------------

describe('flush', () => {
  it('runs high before medium before low (priority)', () => {
    const seen: string[] = []
    const fb = createFrameBudget()
    fb.submit(record('low1', seen, 'low'))
    fb.submit(record('med1', seen, 'medium'))
    fb.submit(record('hi1', seen, 'high'))
    fb.submit(record('hi2', seen, 'high'))
    fb.submit(record('med2', seen, 'medium'))
    fb.flush(Number.POSITIVE_INFINITY)
    expect(seen).toEqual(['hi1', 'hi2', 'med1', 'med2', 'low1'])
  })

  it('within a tier, runs FIFO', () => {
    const seen: string[] = []
    const fb = createFrameBudget()
    for (const id of ['a', 'b', 'c', 'd']) {
      fb.submit(record(id, seen, 'medium'))
    }
    fb.flush(Number.POSITIVE_INFINITY)
    expect(seen).toEqual(['a', 'b', 'c', 'd'])
  })

  it('stops at deadline; remaining tasks stay queued', () => {
    const seen: string[] = []
    const clk = fakeClock()
    const fb = createFrameBudget({ now: clk.now })
    for (let i = 0; i < 5; i++) {
      fb.submit({
        id: `t${i}`,
        priority: 'medium',
        work: () => {
          seen.push(`t${i}`)
          clk.advance(2) // each task costs 2ms
        },
      })
    }
    // Deadline at 5ms — 2 tasks complete (4ms), the 3rd would push us
    // to 6ms but clock check happens BEFORE running each task. After
    // 2 tasks, the next iteration sees now() = 4 < 5 — runs the 3rd
    // (push to 6). After that, now() = 6 >= 5 — stop.
    const done = fb.flush(5)
    expect(done).toBe(3)
    expect(seen).toEqual(['t0', 't1', 't2'])
    expect(fb.queueDepth.peek()).toBe(2)
  })

  it('returns 0 if deadline already passed', () => {
    const clk = fakeClock()
    clk.set(100)
    const fb = createFrameBudget({ now: clk.now })
    fb.submit(record('a', [], 'high'))
    expect(fb.flush(50)).toBe(0)
  })

  it('a throwing task is dropped; others continue', () => {
    const seen: string[] = []
    const fb = createFrameBudget()
    fb.submit({ id: 'a', priority: 'high', work: () => seen.push('a') })
    fb.submit({
      id: 'bad',
      priority: 'high',
      work: () => {
        throw new Error('boom')
      },
    })
    fb.submit({ id: 'c', priority: 'high', work: () => seen.push('c') })
    const done = fb.flush(Number.POSITIVE_INFINITY)
    expect(done).toBe(2) // a + c, not bad
    expect(seen).toEqual(['a', 'c'])
  })
})

// ---------------------------------------------------------------------------
// beginFrame / endFrame
// ---------------------------------------------------------------------------

describe('beginFrame / endFrame', () => {
  it('validates finite timestamps', () => {
    const fb = createFrameBudget()
    for (const m of ['beginFrame', 'endFrame'] as const) {
      try {
        fb[m](Number.NaN)
        expect.fail('expected throw')
      } catch (e) {
        expect(isKLineChartError(e, 'INVALID_PARAM')).toBe(true)
      }
    }
  })

  it('recentFrameMs is the rolling average over historySize frames', () => {
    const fb = createFrameBudget({ historySize: 3 })
    // 3 frames at 10ms each → avg 10
    for (let i = 0; i < 3; i++) {
      fb.beginFrame(i * 16)
      fb.endFrame(i * 16 + 10)
    }
    expect(fb.recentFrameMs.peek()).toBe(10)
    // Push one 20ms frame; rolling window drops the oldest.
    fb.beginFrame(48)
    fb.endFrame(68)
    // window: [10, 10, 20] → avg ≈ 13.33
    expect(fb.recentFrameMs.peek()).toBeCloseTo((10 + 10 + 20) / 3, 5)
  })

  it('overruns increments only when frame > targetMs', () => {
    const fb = createFrameBudget({ targetMs: 16 })
    // 10ms frame — not an overrun
    fb.beginFrame(0)
    fb.endFrame(10)
    expect(fb.overruns.peek()).toBe(0)
    // 18ms frame — overrun
    fb.beginFrame(16)
    fb.endFrame(34)
    expect(fb.overruns.peek()).toBe(1)
    // Exactly at targetMs — not an overrun (> strict)
    fb.beginFrame(32)
    fb.endFrame(48)
    expect(fb.overruns.peek()).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// clear / dispose
// ---------------------------------------------------------------------------

describe('clear', () => {
  it('drops all queued tasks', () => {
    const fb = createFrameBudget()
    fb.submit(record('a', [], 'high'))
    fb.submit(record('b', [], 'low'))
    fb.clear()
    expect(fb.queueDepth.peek()).toBe(0)
  })
})

describe('dispose', () => {
  it('makes submit / flush / frame markers no-ops', () => {
    const fb = createFrameBudget()
    fb.dispose()
    expect(() => fb.submit(record('a', [], 'high'))).not.toThrow()
    expect(fb.queueDepth.peek()).toBe(0)
    expect(fb.flush(Number.POSITIVE_INFINITY)).toBe(0)
  })
})
