import { describe, expect, it } from 'vitest'

import type { CustomMarkerEntity } from '../registry'
import { MarkerManager } from '../registry'
import { createMarkerState } from '../../state/markerState'

function mk(id: string): CustomMarkerEntity {
  return {
    id,
    date: '2025-01-15',
    timestamp: 1,
    shape: 'circle',
  }
}

describe('MarkerManager customMarkers projection', () => {
  it('reads custom markers from injected signal, not local map', () => {
    const state = createMarkerState()
    state.actions.setCustomMarkers([mk('a')])
    const manager = new MarkerManager({ customMarkers$: state.readonly.customMarkers })

    expect(manager.getCustomMarkers().map((m) => m.id)).toEqual(['a'])

    state.actions.setCustomMarkers([mk('b')])
    expect(manager.getCustomMarkers().map((m) => m.id)).toEqual(['b'])
  })

  it('still caches positions for hitTest independently of business state', () => {
    const state = createMarkerState()
    state.actions.setCustomMarkers([mk('a')])
    const manager = new MarkerManager({ customMarkers$: state.readonly.customMarkers })
    manager.setCustomMarkerPosition('a', 10, 20, 12, 'circle')
    expect(manager.hitTestCustomMarker(10, 20)?.id).toBe('a')
  })

  it('clearPositionCache drops hit targets after business markers change', () => {
    const state = createMarkerState()
    state.actions.setCustomMarkers([mk('a')])
    const manager = new MarkerManager({ customMarkers$: state.readonly.customMarkers })
    manager.setCustomMarkerPosition('a', 10, 20, 12, 'circle')
    expect(manager.hitTestCustomMarker(10, 20)?.id).toBe('a')

    state.actions.clearCustomMarkers()
    // 业务态已空，但未清 position 时 hitTest 仍可能因循环无数据而不命中；
    // 清缓存后必须保证无残留 position。
    manager.clearPositionCache()
    expect(manager.hitTestCustomMarker(10, 20)).toBeNull()

    state.actions.setCustomMarkers([mk('a')])
    // 未重新 set position 时不可命中
    expect(manager.hitTestCustomMarker(10, 20)).toBeNull()
  })

  it('stale positions without clear would still require business id match', () => {
    const state = createMarkerState()
    state.actions.setCustomMarkers([mk('a')])
    const manager = new MarkerManager({ customMarkers$: state.readonly.customMarkers })
    manager.setCustomMarkerPosition('a', 10, 20, 12, 'circle')

    state.actions.setCustomMarkers([mk('b')])
    // id a 的 position 残留，但业务列表已是 b → 不可命中 a
    expect(manager.hitTestCustomMarker(10, 20)).toBeNull()
  })
})
