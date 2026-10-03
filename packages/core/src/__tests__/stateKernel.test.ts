import { describe, expect, it, vi } from 'vitest'
import { createScrollContainerStub } from '../engine/__tests__/helpers/scrollContainerStub'
import { createViewportStateDeps } from '../engine/state/__tests__/helpers/createViewportStateDeps'
import {
  batch,
  computed,
  createSignal,
  createSubState,
  effect,
  type ReadonlySignal,
  type WritableSignal,
  writableRef,
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
  /** 滚动相关用例的共享依赖：窄 K 线（kWidth=6 → kGap=1.5）便于在窄视口内构造多根数据。 */
  const scrollDeps = (dataLength?: number) =>
    createViewportStateDeps({
      ...(dataLength !== undefined ? { dataLength } : {}),
      options: { kWidth: 6, kGap: 1 },
      zoomLevel: 1,
    })

  it('creates a sub-state with computed dpr + viewportState', async () => {
    const { createViewportState } = await import('../engine/state/viewportState')
    const module = createViewportState(createViewportStateDeps())
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
    // 物理宽度 16 → 物理间距 10，DPR=2 时输出逻辑间距 5。
    expect(vs.kGap).toBe(5)
  })

  it('scrollTo writes signal and DOM', async () => {
    const { createViewportState } = await import('../engine/state/viewportState')
    const module = createViewportState(scrollDeps())
    module.actions.scrollTo(100)
    expect(module.readonly.scrollLeft()).toBe(100)
  })

  it('bounds programmatic and DOM scroll and reprojects when data shrinks', async () => {
    const { createViewportState } = await import('../engine/state/viewportState')
    const deps = scrollDeps(10)
    const container = createScrollContainerStub()
    const module = createViewportState(deps)

    module.setDomDeps({
      getDom: () => ({ container, scrollContent: null, canvasLayer: null, xAxisCanvas: null }),
      resizeSharedWebGLSurface: () => {},
    })
    module.actions.resize(100, 100, 1)
    module.actions.init()
    expect(module.actions.scrollTo(10_000)).toBe(true)
    expect(module.actions.scrollTo(10_000)).toBe(false)
    const bounded = module.readonly.scrollLeft()
    expect(bounded).toBeLessThan(10_000)
    expect(bounded).toBeLessThanOrEqual(module.readonly.maxScrollLeft())
    expect(module.readonly.scrollLeftLogical()).toBe(
      module.readonly.viewSnapshot().scrollBounds.max,
    )

    container.scrollLeft = 10_000
    module.actions.syncFromDomScroll()
    expect(module.readonly.scrollLeft()).toBe(bounded)

    module.actions.scrollTo(Number.NaN)
    expect(module.readonly.scrollLeft()).toBe(bounded)

    module.actions.scrollTo(10_000)
    deps.dataLength$.set(1)
    expect(module.readonly.scrollLeft()).toBeLessThan(bounded)
    expect(module.readonly.scrollLeftLogical()).toBe(
      module.readonly.viewSnapshot().scrollBounds.max,
    )
  })

  it('leaves content width and scroll DOM writes to the render frame', async () => {
    const { createViewportState } = await import('../engine/state/viewportState')
    const writes: string[] = []
    const scrollContent = {
      style: {
        set width(value: string) {
          writes.push(`width:${value}`)
        },
      },
    } as unknown as HTMLElement
    const container = createScrollContainerStub({
      transformScrollLeft: (value) => {
        writes.push(`scroll:${value}`)
        return value
      },
    })
    const module = createViewportState(scrollDeps(10))

    module.setDomDeps({
      getDom: () => ({ container, scrollContent, canvasLayer: null, xAxisCanvas: null }),
      resizeSharedWebGLSurface: () => {},
    })
    module.actions.resize(100, 100, 1)
    module.actions.init()

    expect(module.readonly.contentWidth()).toBeGreaterThan(100)
    expect(writes).toEqual([])
  })

  it('resize batches dimension writes into one notification', async () => {
    const { createViewportState } = await import('../engine/state/viewportState')
    const module = createViewportState(scrollDeps())
    const listener = vi.fn()
    module.readonly.viewWidth.subscribe(listener)
    module.readonly.viewHeight.subscribe(listener)
    module.actions.resize(200, 150, 1.5)
    // Both subscriptions via the same listener — batched to one call
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
