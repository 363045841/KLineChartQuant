import { describe, expect, it, vi } from 'vitest'

import type { CustomMarkerEntity } from '../../marker/registry'
import { createMarkerState } from '../markerState'

function mk(id: string, overrides: Partial<CustomMarkerEntity> = {}): CustomMarkerEntity {
  return {
    id,
    date: '2025-01-15',
    timestamp: Date.UTC(2025, 0, 15, -8, 0, 0, 0),
    shape: 'circle',
    ...overrides,
  }
}

describe('markerState', () => {
  it('publishes immutable custom marker snapshots', () => {
    const state = createMarkerState()
    const style = { size: 12, fillColor: '#f00' }
    state.actions.setCustomMarkers([mk('a', { style })])
    style.size = 99

    const stored = state.readonly.customMarkers.peek().get('a')!
    expect(stored.style).toEqual({ size: 12, fillColor: '#f00' })
    expect(Object.isFrozen(stored)).toBe(true)
    expect(Object.isFrozen(stored.style)).toBe(true)
    expect(() => {
      ;(stored as { id: string }).id = 'hack'
    }).toThrow()
  })

  it('does not notify when setCustomMarkers is deeply equal', () => {
    const state = createMarkerState()
    const listener = vi.fn()
    state.readonly.customMarkers.subscribe(listener)

    state.actions.setCustomMarkers([mk('a')])
    state.actions.setCustomMarkers([mk('a')])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('registerCustomMarker upserts by id', () => {
    const state = createMarkerState()
    state.actions.setCustomMarkers([mk('a', { shape: 'circle' })])
    state.actions.registerCustomMarker(mk('a', { shape: 'flag' }))
    state.actions.registerCustomMarker(mk('b', { shape: 'diamond' }))

    const map = state.readonly.customMarkers.peek()
    expect(map.size).toBe(2)
    expect(map.get('a')!.shape).toBe('flag')
    expect(map.get('b')!.shape).toBe('diamond')
  })

  it('clearCustomMarkers empties the map', () => {
    const state = createMarkerState()
    state.actions.setCustomMarkers([mk('a'), mk('b')])
    state.actions.clearCustomMarkers()
    expect(state.readonly.customMarkers.peek().size).toBe(0)
  })

  it('rejects non JSON-like metadata', () => {
    const state = createMarkerState()
    expect(() =>
      state.actions.setCustomMarkers([mk('a', { metadata: { d: new Date() } })]),
    ).toThrow(TypeError)
    expect(state.readonly.customMarkers.peek().size).toBe(0)
  })

  it('dispose resets to empty', () => {
    const state = createMarkerState()
    state.actions.setCustomMarkers([mk('a')])
    state.dispose()
    expect(state.readonly.customMarkers.peek().size).toBe(0)
  })
})
