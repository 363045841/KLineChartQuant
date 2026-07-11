import { describe, it, expect, vi } from 'vitest'

import { createSignal, effect, computed } from '../foundation/reactivity/signal'

describe('createSignal', () => {
  it('reads initial value', () => {
    const s = createSignal(42)
    expect(s()).toBe(42)
  })

  it('updates and notifies subscribers on set', () => {
    const s = createSignal(0)
    const listener = vi.fn()
    s.subscribe(listener)
    s.set(1)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(s()).toBe(1)
  })

  it('does NOT notify on equal write (Object.is)', () => {
    const s = createSignal(1)
    const listener = vi.fn()
    s.subscribe(listener)
    s.set(1)
    expect(listener).not.toHaveBeenCalled()
  })

  it('unsubscribes cleanly', () => {
    const s = createSignal(0)
    const listener = vi.fn()
    const unsub = s.subscribe(listener)
    unsub()
    s.set(1)
    expect(listener).not.toHaveBeenCalled()
  })

  it('peek does not track', () => {
    const a = createSignal(1)
    const ran = vi.fn()
    effect(() => {
      ran()
      a.peek()
    })
    ran.mockClear()
    a.set(2)
    expect(ran).not.toHaveBeenCalled()
  })

  it('safe under listener self-unsubscribe during notify', () => {
    const s = createSignal(0)
    const unsub = s.subscribe(() => unsub())
    const other = vi.fn()
    s.subscribe(other)
    expect(() => s.set(1)).not.toThrow()
    expect(other).toHaveBeenCalledTimes(1)
  })
})

describe('effect', () => {
  it('runs once immediately', () => {
    const fn = vi.fn()
    effect(fn)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('re-runs when a tracked signal updates', () => {
    const a = createSignal(1)
    const fn = vi.fn(() => {
      a()
    })
    effect(fn)
    expect(fn).toHaveBeenCalledTimes(1)
    a.set(2)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('stops re-running after dispose', () => {
    const a = createSignal(1)
    const fn = vi.fn(() => {
      a()
    })
    const dispose = effect(fn)
    dispose()
    a.set(2)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('re-tracks dependencies each run', () => {
    const a = createSignal(true)
    const b = createSignal(1)
    const c = createSignal(100)
    const fn = vi.fn(() => {
      if (a()) b()
      else c()
    })
    effect(fn)
    expect(fn).toHaveBeenCalledTimes(1)
    a.set(false)
    expect(fn).toHaveBeenCalledTimes(2)
    // now only c is tracked; mutating b should NOT re-run
    b.set(2)
    expect(fn).toHaveBeenCalledTimes(2)
    c.set(200)
    expect(fn).toHaveBeenCalledTimes(3)
  })
})

describe('computed', () => {
  it('derives from a signal', () => {
    const a = createSignal(2)
    const doubled = computed(() => a() * 2)
    expect(doubled()).toBe(4)
    a.set(5)
    expect(doubled()).toBe(10)
  })

  it('notifies subscribers on derived change', () => {
    const a = createSignal(1)
    const c = computed(() => a() + 1)
    const listener = vi.fn()
    c.subscribe(listener)
    a.set(2)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
