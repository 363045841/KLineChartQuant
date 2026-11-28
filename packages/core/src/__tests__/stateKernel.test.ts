/** 视口状态的契约：导航只有一个写入点，几何全部由投影派生。 */
import { describe, expect, it, vi } from 'vitest'
import {
  batch,
  computed,
  createSignal,
  createSubState,
  effect,
  type ReadonlySignal,
  type WritableSignal,
} from '../foundation/reactivity/signal'
import { createViewportStateDeps } from '../engine/state/__tests__/helpers/createViewportStateDeps'
import { zoomLevelToKWidth } from '../engine/viewport/zoom'

describe('createSubState', () => {
  it('creates derived computed values from writable signals', () => {
    const { signals, readonly } = createSubState({ a: 1, b: 2 }, { sum: (s) => s.a() + s.b() })
    expect(readonly.sum()).toBe(3)
    signals.a.set(10)
    expect(readonly.sum()).toBe(12)
  })

  it('reacts through effect and stops after dispose', () => {
    const { signals, readonly } = createSubState({ a: 1 }, { doubled: (s) => s.a() * 2 })
    const seen: number[] = []
    const stop = effect(() => seen.push(readonly.doubled()))
    signals.a.set(2)
    stop()
    signals.a.set(3)
    expect(seen).toEqual([2, 4])
  })

  it('compares object values by reference before notifying', () => {
    const { signals, readonly } = createSubState({ a: { x: 1, y: 2 } })
    const listener = vi.fn()
    readonly.a.subscribe(listener)
    signals.a.set({ x: 1, y: 2 })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('notifies subscribers when a source signal changes', () => {
    const { signals, readonly } = createSubState({ a: 1 }, { doubled: (s) => s.a() * 2 })
    const listener = vi.fn()
    readonly.doubled.subscribe(listener)
    signals.a.set(3)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(readonly.doubled()).toBe(6)
  })

  it('defers notifications from multiple writes in one batch', () => {
    const { signals, readonly } = createSubState({ a: 1, b: 2 }, { sum: (s) => s.a() + s.b() })
    const listener = vi.fn()
    readonly.sum.subscribe(listener)
    batch(() => {
      signals.a.set(10)
      signals.b.set(20)
    })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(readonly.sum()).toBe(30)
  })
})

describe('viewportState', () => {
  const deps = (dataLength?: number) =>
    createViewportStateDeps({
      ...(dataLength !== undefined ? { dataLength } : {}),
      initialZoomLevel: 1,
      zoomLevelCount: 20,
      minKWidth: 1,
      maxKWidth: 100,
    })

  it('derives geometry from navigation and measurements only', async () => {
    const { createViewportState } = await import('../engine/state/viewportState')
    const viewport = createViewportState(deps())
    viewport.actions.resize(800, 600, 2)

    expect(viewport.readonly.viewWidth()).toBe(800)
    expect(viewport.readonly.viewHeight()).toBe(600)
    expect(viewport.readonly.plotWidth()).toBe(800)
    expect(viewport.readonly.plotHeight()).toBe(570)

    const state = viewport.readonly.viewportState()
    const expectedWidth = zoomLevelToKWidth(viewport.readonly.navigation().zoomLevel, {
      minKWidth: 1,
      maxKWidth: 100,
      zoomLevelCount: 20,
    })
    expect(state.plotWidth).toBe(800)
    expect(state.plotHeight).toBe(570)
    expect(state.visibleFrom).toBeGreaterThanOrEqual(0)
    expect(state.visibleFrom).toBeLessThan(state.visibleTo)
    expect(state.kWidth).toBe(expectedWidth)
    expect(state.kGap).toBeGreaterThanOrEqual(0)
  })

  it('commits the world scroll as the only navigation write', async () => {
    const { createViewportState } = await import('../engine/state/viewportState')
    const viewport = createViewportState(deps())
    viewport.actions.resize(800, 600, 1)

    expect(viewport.actions.commitScroll(100)).toBe(true)
    expect(viewport.readonly.navigation().scroll).toBe(viewport.readonly.scroll())
    expect(viewport.readonly.scroll()).toBeGreaterThan(0)
    expect(viewport.readonly.domScroll()).toBe(viewport.readonly.scroll() + 800)
  })

  it('rejects invalid navigation instead of substituting a value', async () => {
    const { createViewportState } = await import('../engine/state/viewportState')
    const viewport = createViewportState(deps())
    viewport.actions.resize(800, 600, 1)
    viewport.actions.commitScroll(100)
    const before = viewport.readonly.navigation()

    expect(viewport.actions.commitScroll(Number.NaN)).toBe(false)
    expect(viewport.actions.commitZoom(Number.POSITIVE_INFINITY)).toBe(false)
    expect(viewport.readonly.navigation()).toBe(before)
  })

  it('clamps navigation to the bounds and reprojects when data shrinks', async () => {
    const { createViewportState } = await import('../engine/state/viewportState')
    const viewportDeps = deps(10)
    const viewport = createViewportState(viewportDeps)
    viewport.actions.resize(100, 100, 1)

    expect(viewport.actions.commitScroll(10_000)).toBe(true)
    expect(viewport.actions.commitScroll(10_000)).toBe(false)
    const bounded = viewport.readonly.scroll()
    expect(bounded).toBe(viewport.readonly.viewSnapshot().scrollBounds.max)

    viewportDeps.dataLength$.set(1)
    expect(viewport.readonly.scroll()).toBeLessThan(bounded + 1)
    expect(viewport.readonly.scroll()).toBe(
      viewport.readonly.viewSnapshot().scrollBounds.max,
    )
  })

  it('batches dimension writes into one notification', async () => {
    const { createViewportState } = await import('../engine/state/viewportState')
    const viewport = createViewportState(deps())
    const listener = vi.fn()
    viewport.readonly.viewWidth.subscribe(listener)
    viewport.readonly.viewHeight.subscribe(listener)
    viewport.actions.resize(200, 150, 1.5)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('keeps the configured future slots when scrolling to the latest bar', async () => {
    const { createViewportState } = await import('../engine/state/viewportState')
    const viewport = createViewportState(deps(200))
    viewport.actions.resize(600, 400, 1)


    viewport.actions.commitZoom(20)
    expect(viewport.readonly.navigation().zoomLevel).toBe(20)
    expect(viewport.readonly.viewSnapshot().kWidth).toBeCloseTo(100, 6)
    const latest = viewport.readonly.latestScroll.peek()
    expect(latest).not.toBeNull()
    viewport.actions.commitScroll(latest!)
    const snapshot = viewport.readonly.viewSnapshot()
    expect(viewport.readonly.scroll()).toBe(snapshot.scrollBounds.max)
    expect(viewport.readonly.visibleRange().end).toBeGreaterThanOrEqual(200)
  })
})
