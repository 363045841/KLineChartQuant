import { describe, it, expect, vi } from 'vitest'

import {
  createSignal,
  writableRef,
  computed,
  effect,
  batch,
  createSubState,
  type ReadonlySignal,
  type WritableSignal,
} from '../foundation/reactivity/signal'

describe('ReadonlySignal type boundary', () => {
  it('createSignal returns WritableSignal with .set()', () => {
    const s = createSignal(0)
    expect(typeof s.set).toBe('function')
    s.set(42)
    expect(s()).toBe(42)
  })

  it('writableRef is an alias for createSignal', () => {
    const r = writableRef('hello')
    expect(r()).toBe('hello')
    r.set('world')
    expect(r()).toBe('world')
  })

  it('computed returns ReadonlySignal that reads derived value', () => {
    const src = createSignal(1)
    const derived = computed(() => src() * 2)
    expect(derived()).toBe(2)
    src.set(5)
    expect(derived()).toBe(10)
  })

  it('WritableSignal can be assigned to ReadonlySignal (covariance)', () => {
    const writable = createSignal(10)
    const readonly: ReadonlySignal<number> = writable
    expect(readonly()).toBe(10)
    writable.set(20)
    expect(readonly()).toBe(20)
  })

  it('read-only signal has peek() and subscribe()', () => {
    const writable = createSignal('a')
    const readonly: ReadonlySignal<string> = writable
    expect(readonly.peek()).toBe('a')
    const unsub = readonly.subscribe(() => {})
    expect(typeof unsub).toBe('function')
    unsub()
  })

  // The compile-time boundary: ReadonlySignal<T> lacks `.set()`.
  // Verified in stateKernel.types.test.ts via `@ts-expect-error`.
})

describe('createSubState', () => {
  it('creates writable signals internally', () => {
    const { signals } = createSubState({ count: 0, name: '' })
    expect(signals.count()).toBe(0)
    expect(signals.name()).toBe('')
    signals.count.set(5)
    expect(signals.count()).toBe(5)
  })

  it('exposes readonly view that reads source values', () => {
    const { readonly } = createSubState({ count: 0 })
    expect(readonly.count()).toBe(0)
  })

  it('readonly view reflects internal writes', () => {
    const { signals, readonly } = createSubState({ count: 0 })
    signals.count.set(7)
    expect(readonly.count()).toBe(7)
  })

  it('registers computed signals', () => {
    const { readonly, signals } = createSubState(
      { a: 2, b: 3 },
      {
        sum: (s) => s.a() + s.b(),
        product: (s) => s.a() * s.b(),
      },
    )
    expect(readonly.sum()).toBe(5)
    expect(readonly.product()).toBe(6)
    signals.a.set(10)
    expect(readonly.sum()).toBe(13)
    expect(readonly.product()).toBe(30)
  })

  it('computed signals are themselves read-only (verified at compile time)', () => {
    // Compile-time boundary: `.set` does not exist on the type.
    // See stateKernel.types.test.ts for the @ts-expect-error check.
    const { readonly } = createSubState({ a: 1 }, { doubled: (s) => s.a() * 2 })
    expect(readonly.doubled()).toBe(2)
  })

  it('snapshot peeks all source signals', () => {
    const { signals, snapshot } = createSubState({ x: 1, y: 2 })
    signals.x.set(10)
    const snap = snapshot()
    expect(snap).toEqual({ x: 10, y: 2 })
  })

  it('notifies subscribers when source signal changes', () => {
    const { signals, readonly } = createSubState({ a: 1 }, { doubled: (s) => s.a() * 2 })
    const listener = vi.fn()
    readonly.doubled.subscribe(listener)
    signals.a.set(3)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(readonly.doubled()).toBe(6)
  })

  it('batch defers notifications from multiple signal writes', () => {
    const { signals, readonly } = createSubState({ a: 1, b: 2 }, { sum: (s) => s.a() + s.b() })
    const listener = vi.fn()
    readonly.sum.subscribe(listener)
    batch(() => {
      signals.a.set(10)
      signals.b.set(20)
    })
    // even with two writes, listener fires once
    expect(listener).toHaveBeenCalledTimes(1)
    expect(readonly.sum()).toBe(30)
  })
})

describe('viewportState template', () => {
  it('creates a sub-state with computed dpr + viewportState', async () => {
    const { createViewportState } = await import('../engine/state/viewportState')
    const module = createViewportState({
      options$: (() => ({ bottomAxisHeight: 30, kWidth: 8, kGap: 2 })) as any,
      dataLength$: (() => 100) as any,
      period$: (() => 'daily') as any,
      zoomLevel$: (() => 5) as any,
      sessionSlots$: (() => 240) as any,
    })
    module.actions.resize(800, 600, 2)
    expect(module.readonly.viewWidth()).toBe(800)
    expect(module.readonly.viewHeight()).toBe(600)
    expect(module.readonly.plotWidth()).toBe(800)
    expect(module.readonly.plotHeight()).toBe(570)
    const vs = module.readonly.viewportState()
    expect(vs.zoomLevel).toBe(5)
    expect(vs.plotWidth).toBe(800)
    expect(vs.plotHeight).toBe(570)
    expect(vs.visibleFrom).toBeGreaterThanOrEqual(0)
    expect(vs.visibleFrom).toBeLessThan(vs.visibleTo)
    expect(vs.kWidth).toBe(8)
    // kGap 由 kGapFromKWidth(8,2)=1.5 推导，不再从 options$ 透传
    expect(vs.kGap).toBe(1.5)
  })

  it('scrollTo writes signal and DOM', async () => {
    const { createViewportState } = await import('../engine/state/viewportState')
    const module = createViewportState({
      options$: (() => ({ bottomAxisHeight: 30, kWidth: 6, kGap: 1 })) as any,
      dataLength$: (() => 100) as any,
      period$: (() => 'daily') as any,
      zoomLevel$: (() => 1) as any,
      sessionSlots$: (() => 240) as any,
    })
    module.actions.scrollTo(100)
    expect(module.readonly.scrollLeft()).toBe(100)
  })

  it('derives content width and max scroll from viewport, data, DPR, options, and period', async () => {
    const { createViewportState } = await import('../engine/state/viewportState')
    const dataLength$ = createSignal(10)
    const options$ = createSignal({ bottomAxisHeight: 30, kWidth: 6, kGap: 1 })
    const period$ = createSignal('daily')
    const module = createViewportState({
      options$,
      dataLength$,
      zoomLevel$: (() => 1) as any,
      period$,
      sessionSlots$: (() => 240) as any,
    } as any)
    module.actions.resize(200, 150, 2)

    // kGap 由 kGapFromKWidth(6,2)=1.5 自动推导。宽度取奇 11px，间隙 3px（物理）。
    expect((module.readonly as any).contentWidth()).toBe(481.5)
    expect((module.readonly as any).maxScrollLeft()).toBe(281.5)

    dataLength$.set(20)
    expect((module.readonly as any).contentWidth()).toBe(551.5)
    expect((module.readonly as any).maxScrollLeft()).toBe(351.5)

    module.actions.resize(300, 150, 2)
    expect((module.readonly as any).contentWidth()).toBe(651.5)
    expect((module.readonly as any).maxScrollLeft()).toBe(351.5)

    options$.set({ bottomAxisHeight: 30, kWidth: 10, kGap: 2 })
    expect((module.readonly as any).contentWidth()).toBe(851.5)
    expect((module.readonly as any).maxScrollLeft()).toBe(551.5)

    period$.set('timeshare')
    expect((module.readonly as any).contentWidth()).toBe(300)
    expect((module.readonly as any).maxScrollLeft()).toBe(0)
  })

  it('clamps programmatic and user DOM scroll inputs to the derived maximum', async () => {
    const { createViewportState } = await import('../engine/state/viewportState')
    const dataLength$ = createSignal(10)
    let scrollLeft = 0
    const container = {
      get scrollLeft() {
        return scrollLeft
      },
      set scrollLeft(value: number) {
        scrollLeft = value
      },
    } as unknown as HTMLElement
    const module = createViewportState({
      options$: (() => ({ bottomAxisHeight: 30, kWidth: 6, kGap: 1 })) as any,
      dataLength$,
      zoomLevel$: (() => 1) as any,
      period$: (() => 'daily') as any,
    } as any)

    module.setDomDeps({
      getDom: () => ({ container, scrollContent: null, canvasLayer: null, xAxisCanvas: null }),
      resizeSharedWebGLSurface: () => {},
    })
    module.actions.resize(100, 100, 1)
    module.actions.init()
    module.actions.scrollTo(10_000)
    expect(module.readonly.scrollLeft()).toBe((module.readonly as any).maxScrollLeft())

    scrollLeft = 10_000
    module.actions.syncFromDomScroll()
    expect(module.readonly.scrollLeft()).toBe((module.readonly as any).maxScrollLeft())

    module.actions.scrollTo(Number.NaN)
    expect(module.readonly.scrollLeft()).toBe(0)

    module.actions.scrollTo(10_000)
    dataLength$.set(1)
    expect(module.readonly.scrollLeft()).toBe((module.readonly as any).maxScrollLeft())
    expect(container.scrollLeft).toBe(module.readonly.scrollLeft())
  })

  it('writes derived content width before the derived scroll position', async () => {
    const { createViewportState } = await import('../engine/state/viewportState')
    const writes: string[] = []
    let scrollLeft = 0
    const scrollContent = {
      style: {
        set width(value: string) {
          writes.push(`width:${value}`)
        },
      },
    } as unknown as HTMLElement
    const container = {
      get scrollLeft() {
        return scrollLeft
      },
      set scrollLeft(value: number) {
        writes.push(`scroll:${value}`)
        scrollLeft = value
      },
    } as unknown as HTMLElement
    const module = createViewportState({
      options$: (() => ({ bottomAxisHeight: 30, kWidth: 6, kGap: 1 })) as any,
      dataLength$: (() => 10) as any,
      zoomLevel$: (() => 1) as any,
      period$: (() => 'daily') as any,
    } as any)

    module.setDomDeps({
      getDom: () => ({ container, scrollContent, canvasLayer: null, xAxisCanvas: null }),
      resizeSharedWebGLSurface: () => {},
    })
    module.actions.resize(100, 100, 1)
    module.actions.init()

    expect(writes).toEqual([`width:${(module.readonly as any).contentWidth()}px`, `scroll:${module.readonly.scrollLeft()}`])
  })

  it('resize batches dimension writes into one notification', async () => {
    const { createViewportState } = await import('../engine/state/viewportState')
    const module = createViewportState({
      options$: (() => ({ bottomAxisHeight: 30, kWidth: 6, kGap: 1 })) as any,
      dataLength$: (() => 100) as any,
      period$: (() => 'daily') as any,
      zoomLevel$: (() => 1) as any,
      sessionSlots$: (() => 240) as any,
    })
    const listener = vi.fn()
    module.readonly.viewWidth.subscribe(listener)
    module.readonly.viewHeight.subscribe(listener)
    module.actions.resize(200, 150, 1.5)
    // Both subscriptions via the same listener — batched to one call
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
