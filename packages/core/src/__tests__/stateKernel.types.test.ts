/**
 * Type-only test for the StateKernel readonly boundary.
 * Doesn't run at runtime — `pnpm type-check` enforces these constraints.
 */
import { describe, expect, it } from 'vitest'
import { createViewportStateDeps } from '../engine/state/__tests__/helpers/createViewportStateDeps'
import { createViewportState } from '../engine/state/viewportState'
import {
  computed,
  createSubState,
  type ReadonlySignal,
  writableRef,
} from '../foundation/reactivity/signal'

describe('StateKernel type constraints (compile-time)', () => {
  it('ReadonlySignal<T> has no .set property', () => {
    const s = writableRef(0)
    const r: ReadonlySignal<number> = s
    // @ts-expect-error `.set` should not exist on ReadonlySignal
    void r.set
  })

  it('createSubState computed results are read-only', () => {
    const { readonly } = createSubState({ x: 1 }, { y: (s) => s.x() * 2 })
    // @ts-expect-error `.set` should not exist on computed readonly result
    void readonly.y.set
  })

  it('createViewportState readonly viewportState signal has no .set', () => {
    const m = createViewportState(
      createViewportStateDeps({ options: { kWidth: 6, kGap: 1 }, zoomLevel: 1 }),
    )
    // @ts-expect-error `.set` should not exist on the readonly view
    void m.readonly.viewportState.set
  })
})

describe('StateKernel runtime constraints', () => {
  it('createSubState readonly bag has no callable set at runtime', () => {
    const m = createSubState({ x: 1 })
    expect((m.readonly.x as any).set).toBeUndefined()
  })
})
