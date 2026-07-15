/**
 * Tests for `createGestureRecognizer`.
 *
 * Coverage:
 *   1. State machine — idle / tracking / pan / pinch transitions.
 *   2. Tap — single pointer down/up within deadzone.
 *   3. Pan — primary pointer escapes deadzone, emits panStart + pan + panEnd.
 *   4. Swipe — pan with fast release crosses velocity threshold → swipe.
 *   5. Pinch — two pointers down, scale computed against initial distance.
 *   6. Pinch → tracking demotion when one of the two pointers releases.
 *   7. cancel() resets without emit.
 *   8. Config validation — negative deadzone / velocity rejected.
 *   9. dispose() makes everything a no-op.
 */

import { describe, it, expect } from 'vitest'

import { createGestureRecognizer, type PointerEventLike, type GestureEvent } from '..'
import { isKLineChartError } from '../../../errors'

function pt(id: number, x: number, y: number, ts: number): PointerEventLike {
  return { pointerId: id, x, y, timestamp: ts }
}

/**
 * Drive the recognizer and collect every emitted event in order.
 */
function drive(
  g: ReturnType<typeof createGestureRecognizer>,
  steps: Array<['down' | 'move' | 'up', PointerEventLike]>,
): GestureEvent[] {
  const out: GestureEvent[] = []
  g.events.subscribe(() => {
    const e = g.events.peek()
    if (e !== null) out.push(e)
  })
  for (const [op, e] of steps) {
    if (op === 'down') g.onPointerDown(e)
    else if (op === 'move') g.onPointerMove(e)
    else g.onPointerUp(e)
  }
  return out
}

// ---------------------------------------------------------------------------
// Tap
// ---------------------------------------------------------------------------

describe('tap', () => {
  it('down + up within deadzone emits a tap', () => {
    const g = createGestureRecognizer({ panDeadzone: 6 })
    const events = drive(g, [
      ['down', pt(1, 100, 100, 0)],
      ['up', pt(1, 102, 101, 50)],
    ])
    expect(events.map((e) => e.type)).toEqual(['tap'])
    expect(g.state.peek()).toBe('idle')
  })

  it('down + up at exact same point emits a tap (no movement at all)', () => {
    const g = createGestureRecognizer()
    const events = drive(g, [
      ['down', pt(1, 50, 50, 0)],
      ['up', pt(1, 50, 50, 100)],
    ])
    expect(events.map((e) => e.type)).toEqual(['tap'])
  })
})

// ---------------------------------------------------------------------------
// Pan
// ---------------------------------------------------------------------------

describe('pan', () => {
  it('promotes to pan when movement escapes deadzone', () => {
    const g = createGestureRecognizer({ panDeadzone: 6, swipeMinVelocity: 999 })
    const events = drive(g, [
      ['down', pt(1, 100, 100, 0)],
      ['move', pt(1, 102, 102, 10)],
      ['move', pt(1, 120, 100, 20)], // 20px from start → past deadzone
      ['move', pt(1, 140, 100, 30)],
      ['up', pt(1, 140, 100, 1000)], // slow release → panEnd, not swipe
    ])
    const types = events.map((e) => e.type)
    expect(types).toContain('panStart')
    expect(types.filter((t) => t === 'pan').length).toBeGreaterThanOrEqual(1)
    expect(types[types.length - 1]).toBe('panEnd')
  })

  it('panStart fires exactly once per gesture', () => {
    const g = createGestureRecognizer({ panDeadzone: 6, swipeMinVelocity: 999 })
    const events = drive(g, [
      ['down', pt(1, 0, 0, 0)],
      ['move', pt(1, 20, 0, 10)],
      ['move', pt(1, 40, 0, 20)],
      ['move', pt(1, 60, 0, 30)],
      ['up', pt(1, 60, 0, 1000)],
    ])
    expect(events.filter((e) => e.type === 'panStart').length).toBe(1)
  })

  it('pan events carry running dx/dy', () => {
    const g = createGestureRecognizer({ panDeadzone: 0, swipeMinVelocity: 999 })
    const events = drive(g, [
      ['down', pt(1, 0, 0, 0)],
      ['move', pt(1, 10, 5, 10)],
      ['move', pt(1, 30, 12, 20)],
      ['up', pt(1, 30, 12, 1000)],
    ])
    const pans = events.filter((e): e is Extract<GestureEvent, { type: 'pan' }> => e.type === 'pan')
    // First pan: dx = 10 - 0 = 10, dy = 5 - 0 = 5
    expect(pans[0]?.dx).toBe(10)
    expect(pans[0]?.dy).toBe(5)
    // Second pan: dx = 30 - 10 = 20, dy = 12 - 5 = 7
    expect(pans[1]?.dx).toBe(20)
    expect(pans[1]?.dy).toBe(7)
  })
})

// ---------------------------------------------------------------------------
// Swipe
// ---------------------------------------------------------------------------

describe('swipe', () => {
  it('fast release after pan emits swipe instead of panEnd', () => {
    const g = createGestureRecognizer({
      panDeadzone: 6,
      swipeMinVelocity: 0.5,
      swipeVelocityWindowMs: 100,
    })
    // 100px in 50ms → 2 px/ms, comfortably above 0.5
    const events = drive(g, [
      ['down', pt(1, 0, 0, 0)],
      ['move', pt(1, 20, 0, 10)],
      ['move', pt(1, 60, 0, 30)],
      ['move', pt(1, 100, 0, 50)],
      ['up', pt(1, 100, 0, 50)],
    ])
    const last = events[events.length - 1]
    expect(last?.type).toBe('swipe')
    const swipe = last as Extract<GestureEvent, { type: 'swipe' }>
    expect(swipe.vx).toBeGreaterThan(0.5)
  })

  it('slow release after pan emits panEnd, not swipe', () => {
    const g = createGestureRecognizer({
      panDeadzone: 6,
      swipeMinVelocity: 0.5,
      swipeVelocityWindowMs: 100,
    })
    // 20px in 200ms → 0.1 px/ms, below threshold
    const events = drive(g, [
      ['down', pt(1, 0, 0, 0)],
      ['move', pt(1, 10, 0, 100)],
      ['move', pt(1, 20, 0, 200)],
      ['up', pt(1, 20, 0, 200)],
    ])
    expect(events[events.length - 1]?.type).toBe('panEnd')
  })
})

// ---------------------------------------------------------------------------
// Pinch
// ---------------------------------------------------------------------------

describe('pinch', () => {
  it('second pointer down → pinchStart', () => {
    const g = createGestureRecognizer()
    const events = drive(g, [
      ['down', pt(1, 0, 0, 0)],
      ['down', pt(2, 100, 0, 10)],
    ])
    const start = events.find((e) => e.type === 'pinchStart') as
      | Extract<GestureEvent, { type: 'pinchStart' }>
      | undefined
    expect(start).toBeDefined()
    expect(start?.cx).toBe(50)
    expect(start?.distance).toBe(100)
    expect(g.state.peek()).toBe('pinch')
  })

  it('scale doubles when distance doubles', () => {
    const g = createGestureRecognizer()
    const events = drive(g, [
      ['down', pt(1, 0, 0, 0)],
      ['down', pt(2, 100, 0, 10)],
      ['move', pt(2, 200, 0, 20)], // distance 200, started at 100 → scale 2
    ])
    const pinches = events.filter(
      (e): e is Extract<GestureEvent, { type: 'pinch' }> => e.type === 'pinch',
    )
    expect(pinches[pinches.length - 1]?.scale).toBeCloseTo(2, 10)
  })

  it('lifting one finger emits pinchEnd and demotes to tracking', () => {
    const g = createGestureRecognizer()
    const events = drive(g, [
      ['down', pt(1, 0, 0, 0)],
      ['down', pt(2, 100, 0, 10)],
      ['up', pt(2, 100, 0, 20)],
    ])
    expect(events.find((e) => e.type === 'pinchEnd')).toBeDefined()
    expect(g.state.peek()).toBe('tracking')
  })
})

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

describe('cancel', () => {
  it('resets to idle without emitting', () => {
    const g = createGestureRecognizer()
    const seen: GestureEvent[] = []
    g.events.subscribe(() => {
      const e = g.events.peek()
      if (e !== null) seen.push(e)
    })
    g.onPointerDown(pt(1, 0, 0, 0))
    g.onPointerMove(pt(1, 100, 0, 10))
    const before = seen.length
    g.cancel()
    expect(g.state.peek()).toBe('idle')
    expect(seen.length).toBe(before) // no emit on cancel
  })
})

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

describe('options validation', () => {
  it('rejects negative panDeadzone', () => {
    try {
      createGestureRecognizer({ panDeadzone: -1 })
      expect.fail('expected throw')
    } catch (e) {
      expect(isKLineChartError(e, 'INVALID_PARAM')).toBe(true)
    }
  })

  it('rejects negative swipeMinVelocity', () => {
    try {
      createGestureRecognizer({ swipeMinVelocity: -0.1 })
      expect.fail('expected throw')
    } catch (e) {
      expect(isKLineChartError(e, 'INVALID_PARAM')).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Dispose
// ---------------------------------------------------------------------------

describe('dispose', () => {
  it('makes pointer handlers and cancel into no-ops', () => {
    const g = createGestureRecognizer()
    g.dispose()
    const seen: GestureEvent[] = []
    g.events.subscribe(() => {
      const e = g.events.peek()
      if (e !== null) seen.push(e)
    })
    g.onPointerDown(pt(1, 0, 0, 0))
    g.onPointerMove(pt(1, 100, 0, 10))
    g.onPointerUp(pt(1, 100, 0, 20))
    expect(seen).toEqual([])
    expect(g.state.peek()).toBe('idle')
  })
})
