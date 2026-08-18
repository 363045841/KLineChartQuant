import { describe, it, expect, vi } from 'vitest'

import { createDrawingController } from '../createDrawingController'

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe('createDrawingController — construction', () => {
  it('defaults to null activeTool and zero drawingCount', () => {
    const c = createDrawingController()
    expect(c.state()).toEqual({ activeTool: null, drawingCount: 0 })
  })

  it('accepts an initial active tool', () => {
    const c = createDrawingController({ initialActiveTool: 'trend-line' })
    expect(c.state().activeTool).toBe('trend-line')
    expect(c.state().drawingCount).toBe(0)
  })

  it('accepts an initial drawing count', () => {
    const c = createDrawingController({ initialDrawingCount: 5 })
    expect(c.state().drawingCount).toBe(5)
  })

  it('floors a negative initial drawing count at 0', () => {
    const c = createDrawingController({ initialDrawingCount: -3 })
    expect(c.state().drawingCount).toBe(0)
  })

  it('accepts both initial values together', () => {
    const c = createDrawingController({
      initialActiveTool: 'fib-retracement',
      initialDrawingCount: 2,
    })
    expect(c.state()).toEqual({ activeTool: 'fib-retracement', drawingCount: 2 })
  })
})

// ---------------------------------------------------------------------------
// setActiveTool
// ---------------------------------------------------------------------------

describe('setActiveTool', () => {
  it('round-trips through every drawing tool type', () => {
    const c = createDrawingController()
    const types = ['trend-line', 'h-line', 'fib-retracement', 'rectangle', 'arrow'] as const

    for (const t of types) {
      c.setActiveTool(t)
      expect(c.state().activeTool).toBe(t)
    }
  })

  it('can clear the active tool with null', () => {
    const c = createDrawingController({ initialActiveTool: 'trend-line' })
    c.setActiveTool(null)
    expect(c.state().activeTool).toBeNull()
  })

  it('emits exactly one notification per change', () => {
    const c = createDrawingController()
    const listener = vi.fn()
    c.state.subscribe(listener)
    c.setActiveTool('rectangle')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does not emit when the value is unchanged', () => {
    const c = createDrawingController({ initialActiveTool: 'fib-retracement' })
    const listener = vi.fn()
    c.state.subscribe(listener)
    c.setActiveTool('fib-retracement')
    expect(listener).not.toHaveBeenCalled()
  })

  it('preserves drawingCount when changing tools', () => {
    const c = createDrawingController({ initialDrawingCount: 4 })
    c.setActiveTool('arrow')
    expect(c.state().drawingCount).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// clearAll
// ---------------------------------------------------------------------------

describe('clearAll', () => {
  it('resets drawingCount to 0', () => {
    const c = createDrawingController({ initialDrawingCount: 7 })
    c.clearAll()
    expect(c.state().drawingCount).toBe(0)
  })

  it('preserves activeTool', () => {
    const c = createDrawingController({
      initialActiveTool: 'h-line',
      initialDrawingCount: 3,
    })
    c.clearAll()
    expect(c.state().activeTool).toBe('h-line')
  })

  it('emits one notification when count was non-zero', () => {
    const c = createDrawingController({ initialDrawingCount: 2 })
    const listener = vi.fn()
    c.state.subscribe(listener)
    c.clearAll()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does not emit when count is already 0', () => {
    const c = createDrawingController()
    const listener = vi.fn()
    c.state.subscribe(listener)
    c.clearAll()
    expect(listener).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// deleteLast
// ---------------------------------------------------------------------------

describe('deleteLast', () => {
  it('decrements drawingCount by 1', () => {
    const c = createDrawingController({ initialDrawingCount: 3 })
    c.deleteLast()
    expect(c.state().drawingCount).toBe(2)
  })

  it('floors at 0 — no-op when count is 0', () => {
    const c = createDrawingController()
    const listener = vi.fn()
    c.state.subscribe(listener)
    c.deleteLast()
    expect(c.state().drawingCount).toBe(0)
    expect(listener).not.toHaveBeenCalled()
  })

  it('emits one notification per successful decrement', () => {
    const c = createDrawingController({ initialDrawingCount: 2 })
    const listener = vi.fn()
    c.state.subscribe(listener)
    c.deleteLast()
    c.deleteLast()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(c.state().drawingCount).toBe(0)
    // third call is a no-op (floor)
    c.deleteLast()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('preserves activeTool when decrementing', () => {
    const c = createDrawingController({
      initialActiveTool: 'rectangle',
      initialDrawingCount: 2,
    })
    c.deleteLast()
    expect(c.state().activeTool).toBe('rectangle')
  })
})

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe('immutability', () => {
  it('produces a new state object on every successful mutation', () => {
    const c = createDrawingController({ initialDrawingCount: 1 })
    const before = c.state()
    c.setActiveTool('arrow')
    const after = c.state()
    expect(after).not.toBe(before)
    // the original snapshot must not have been mutated
    expect(before.activeTool).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// dispose
// ---------------------------------------------------------------------------

describe('dispose', () => {
  it('silences subsequent mutators for previously-attached subscribers', () => {
    const c = createDrawingController({ initialDrawingCount: 3 })
    const listener = vi.fn()
    c.state.subscribe(listener)

    c.dispose()

    c.setActiveTool('fib-retracement')
    c.clearAll()
    c.deleteLast()

    expect(listener).not.toHaveBeenCalled()
    // state is frozen at its pre-dispose value
    expect(c.state()).toEqual({ activeTool: null, drawingCount: 3 })
  })

  it('is idempotent', () => {
    const c = createDrawingController()
    expect(() => {
      c.dispose()
      c.dispose()
      c.dispose()
    }).not.toThrow()
  })
})
