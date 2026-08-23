import { describe, expect, it } from 'vitest'

import { createSignal } from '../../../foundation/reactivity/signal'
import { createZoomState } from '../zoomState'

function createState() {
  const minKWidth$ = createSignal(4)
  const maxKWidth$ = createSignal(20)
  const dataView$ = createSignal<'kline' | 'timeshare' | 'fiveDayTimeShare' | 'comparison'>('kline')
  return { state: createZoomState({ minKWidth$, maxKWidth$, dataView$, zoomLevelCount: 5 }), dataView$ }
}

describe('zoomState', () => {
  it('clamps zoom levels at the state boundary', () => {
    const { state } = createState()

    state.actions.setZoomLevel(99)
    expect(state.readonly.zoomLevel()).toBe(5)

    state.actions.setZoomLevel(-1)
    expect(state.readonly.zoomLevel()).toBe(1)
  })

  it('uses the time-share width only in the time-share view', () => {
    const { state, dataView$ } = createState()

    state.actions.setTimeShareKWidth(7.25)
    expect(state.readonly.kWidth()).toBe(4)

    dataView$.set('timeshare')
    expect(state.readonly.kWidth()).toBe(7.25)

    state.actions.setZoomLevel(3)
    expect(state.readonly.kWidth()).toBe(7.25)

    dataView$.set('kline')
    expect(state.readonly.kWidth()).toBe(12)
  })
})
