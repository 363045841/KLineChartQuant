import { describe, expect, it } from 'vitest'

import { createSignal } from '@/foundation/reactivity/signal'
import { createZoomState } from '../zoomState'

function createState() {
  const minKWidth$ = createSignal(4)
  const maxKWidth$ = createSignal(20)
  const dataView$ = createSignal<'kline' | 'timeshare' | 'fiveDayTimeShare' | 'comparison'>('kline')
  return {
    state: createZoomState({ minKWidth$, maxKWidth$, dataView$, zoomLevelCount: 5 }),
    dataView$,
  }
}

describe('zoomState', () => {
  it('clamps zoom levels at the state boundary', () => {
    const { state } = createState()

    state.actions.setZoomLevel(99)
    expect(state.readonly.zoomLevel()).toBe(5)

    state.actions.setZoomLevel(-1)
    expect(state.readonly.zoomLevel()).toBe(1)
  })

  it('isolates zoom and slot width state across views', () => {
    const { state, dataView$ } = createState()

    state.actions.setZoomLevel(3)
    dataView$.set('fiveDayTimeShare')
    state.actions.setSessionSlotWidth(7.25)
    expect(state.readonly.kWidth()).toBe(4)
    expect(state.readonly.timeShareSlotWidth()).toBe(7.25)

    dataView$.set('kline')
    expect(state.readonly.kWidth()).toBe(12)
    expect(state.readonly.timeShareSlotWidth()).toBeNull()
  })
})
