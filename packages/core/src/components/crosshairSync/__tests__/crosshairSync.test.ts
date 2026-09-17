/**
 * Tests for `createCrosshairSync`.
 *
 * Coverage:
 *   1. Single-pane register + paneCount.
 *   2. Multi-pane register: paneCount tracks correctly.
 *   3. Idempotent register (re-registering same id is a no-op).
 *   4. unregister removes + drops position when it owns the source.
 *   5. unregister of unknown id is a no-op.
 *   6. move emits position with index + source.
 *   7. move from unregistered pane throws KLineChartError(NOT_REGISTERED).
 *   8. move with non-finite index throws INVALID_PARAM.
 *   9. Index normalisation: fractional inputs round to integer.
 *  10. Repeat move with same (index, source) is coalesced.
 *  11. clear() resets position to null.
 *  12. clear() when already null doesn't notify.
 *  13. reset() empties registry + position.
 *  14. dispose() turns everything into a no-op.
 *  15. Loop-prevention pattern: subscribers can identify own emissions.
 */

import { describe, expect, it } from 'vitest'
import { isKLineChartError } from '../../../errors'
import { type CrosshairPosition, createCrosshairSync } from '..'

function collect(s: ReturnType<typeof createCrosshairSync>): CrosshairPosition[] {
  const out: CrosshairPosition[] = []
  s.position.subscribe(() => {
    const p = s.position.peek()
    if (p !== null) out.push(p)
  })
  return out
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe('register', () => {
  it('starts with paneCount = 0 and position null', () => {
    const s = createCrosshairSync()
    expect(s.paneCount.peek()).toBe(0)
    expect(s.position.peek()).toBeNull()
  })

  it('register increments paneCount', () => {
    const s = createCrosshairSync()
    s.register('a')
    s.register('b')
    s.register('c')
    expect(s.paneCount.peek()).toBe(3)
  })

  it('re-registering same id is a no-op', () => {
    const s = createCrosshairSync()
    s.register('a')
    s.register('a')
    expect(s.paneCount.peek()).toBe(1)
  })

  it('empty paneId throws', () => {
    const s = createCrosshairSync()
    try {
      s.register('')
      expect.fail('expected throw')
    } catch (e) {
      expect(isKLineChartError(e, 'INVALID_PARAM')).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// unregister
// ---------------------------------------------------------------------------

describe('unregister', () => {
  it('removes the pane', () => {
    const s = createCrosshairSync()
    s.register('a')
    s.register('b')
    s.unregister('a')
    expect(s.paneCount.peek()).toBe(1)
  })

  it('drops position when the source pane leaves', () => {
    const s = createCrosshairSync()
    s.register('a')
    s.register('b')
    s.move('a', 100)
    expect(s.position.peek()).not.toBeNull()
    s.unregister('a')
    expect(s.position.peek()).toBeNull()
  })

  it('keeps position when a non-source pane leaves', () => {
    const s = createCrosshairSync()
    s.register('a')
    s.register('b')
    s.move('a', 100)
    s.unregister('b')
    expect(s.position.peek()?.index).toBe(100)
  })

  it('unregistering an unknown id is a no-op', () => {
    const s = createCrosshairSync()
    s.register('a')
    expect(() => s.unregister('nope')).not.toThrow()
    expect(s.paneCount.peek()).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// move
// ---------------------------------------------------------------------------

describe('move', () => {
  it('emits position with index and source', () => {
    const s = createCrosshairSync()
    s.register('a')
    s.move('a', 50)
    const p = s.position.peek()
    expect(p?.index).toBe(50)
    expect(p?.source).toBe('a')
  })

  it('throws NOT_REGISTERED when the producer pane is unknown', () => {
    const s = createCrosshairSync()
    try {
      s.move('ghost', 50)
      expect.fail('expected throw')
    } catch (e) {
      expect(isKLineChartError(e, 'NOT_REGISTERED')).toBe(true)
    }
  })

  it('throws INVALID_PARAM on non-finite index', () => {
    const s = createCrosshairSync()
    s.register('a')
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      try {
        s.move('a', bad)
        expect.fail(`expected throw for ${bad}`)
      } catch (e) {
        expect(isKLineChartError(e, 'INVALID_PARAM')).toBe(true)
      }
    }
  })

  it('rounds fractional indices to integers', () => {
    const s = createCrosshairSync()
    s.register('a')
    s.move('a', 50.4)
    expect(s.position.peek()?.index).toBe(50)
    s.move('a', 50.6)
    expect(s.position.peek()?.index).toBe(51)
  })

  it('coalesces identical (index, source) updates', () => {
    const s = createCrosshairSync()
    s.register('a')
    const events = collect(s)
    s.move('a', 50)
    s.move('a', 50)
    s.move('a', 50)
    expect(events.length).toBe(1)
  })

  it('does not coalesce when source changes even if index is same', () => {
    const s = createCrosshairSync()
    s.register('a')
    s.register('b')
    const events = collect(s)
    s.move('a', 50)
    s.move('b', 50)
    expect(events.length).toBe(2)
    expect(events[0]?.source).toBe('a')
    expect(events[1]?.source).toBe('b')
  })
})

// ---------------------------------------------------------------------------
// Loop prevention pattern
// ---------------------------------------------------------------------------

describe('loop-prevention pattern', () => {
  it('subscribers can skip their own emissions using source', () => {
    const s = createCrosshairSync()
    s.register('a')
    s.register('b')
    const aSaw: number[] = []
    const bSaw: number[] = []
    s.position.subscribe(() => {
      const p = s.position.peek()
      if (p === null || p.source === 'a') return
      aSaw.push(p.index)
    })
    s.position.subscribe(() => {
      const p = s.position.peek()
      if (p === null || p.source === 'b') return
      bSaw.push(p.index)
    })
    s.move('a', 10)
    s.move('b', 20)
    expect(aSaw).toEqual([20]) // a skips its own emission
    expect(bSaw).toEqual([10]) // b skips its own emission
  })
})

// ---------------------------------------------------------------------------
// clear / reset
// ---------------------------------------------------------------------------

describe('clear', () => {
  it('sets position to null', () => {
    const s = createCrosshairSync()
    s.register('a')
    s.move('a', 5)
    s.clear()
    expect(s.position.peek()).toBeNull()
  })

  it('clear when already null does not notify', () => {
    const s = createCrosshairSync()
    let notifies = 0
    s.position.subscribe(() => {
      notifies++
    })
    s.clear()
    s.clear()
    expect(notifies).toBe(0)
  })
})

describe('reset', () => {
  it('empties registry and position', () => {
    const s = createCrosshairSync()
    s.register('a')
    s.register('b')
    s.move('a', 5)
    s.reset()
    expect(s.paneCount.peek()).toBe(0)
    expect(s.position.peek()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// dispose
// ---------------------------------------------------------------------------

describe('dispose', () => {
  it('makes register / move / unregister / clear no-ops', () => {
    const s = createCrosshairSync()
    s.register('a')
    s.dispose()
    expect(() => s.register('b')).not.toThrow()
    expect(() => s.move('a', 5)).not.toThrow()
    expect(() => s.clear()).not.toThrow()
    expect(s.position.peek()).toBeNull()
  })
})
