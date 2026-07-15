import { describe, expect, it } from 'vitest'

import { createSignal } from '../../../foundation/reactivity/signal'
import { createZoomState } from '../zoomState'

function createState() {
  const minKWidth$ = createSignal(4)
  const maxKWidth$ = createSignal(20)
  return createZoomState({ minKWidth$, maxKWidth$, zoomLevelCount: 5 })
}

describe('zoomState', () => {
  it('clamps zoom levels at the state boundary', () => {
    const state = createState()

    state.actions.setZoomLevel(99)
    expect(state.readonly.zoomLevel()).toBe(5)

    state.actions.setZoomLevel(-1)
    expect(state.readonly.zoomLevel()).toBe(1)
  })

  it('uses an explicit kWidth until a discrete zoom level is selected', () => {
    const state = createState()

    state.actions.setDirectKWidth(7.25)
    expect(state.readonly.kWidth()).toBe(7.25)

    state.actions.setZoomLevel(3)
    expect(state.readonly.kWidth()).toBe(12)
  })
})
