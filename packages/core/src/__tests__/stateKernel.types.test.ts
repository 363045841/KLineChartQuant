/**
 * Type-only test for the StateKernel readonly boundary.
 * Doesn't run at runtime — `pnpm type-check` enforces these constraints.
 */
import { describe, it } from 'vitest'
import {
  createSubState,
  computed,
  writableRef,
  type ReadonlySignal,
} from '../foundation/reactivity/signal'
import { createViewportState } from '../engine/state/viewportState'

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
    const m = createViewportState({
      getDom: () => ({ container: null, canvasLayer: null, xAxisCanvas: null }),
      options$: (() => ({ bottomAxisHeight: 30, kWidth: 6, kGap: 1 })) as any,
      dataLength$: (() => 100) as any,
      zoomLevel$: (() => 1) as any,
      resizeSharedWebGLSurface: () => {},
      onResizeCompleted: () => {},
    })
    // @ts-expect-error `.set` should not exist on the readonly view
    void m.readonly.viewportState.set
  })
})
