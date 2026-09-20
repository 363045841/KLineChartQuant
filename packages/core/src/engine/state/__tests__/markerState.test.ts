import { describe, expect, it, vi } from 'vitest'

import { createCustomMarker } from '../../marker/__tests__/helpers/createCustomMarker'
import { createMarkerState } from '../markerState'

describe('markerState', () => {
  it('publishes immutable custom marker snapshots', () => {
    const state = createMarkerState()
    const style = { size: 12, fillColor: '#f00' }
    state.actions.setCustomMarkers([createCustomMarker('a', { style })])
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

    state.actions.setCustomMarkers([createCustomMarker('a')])
    state.actions.setCustomMarkers([createCustomMarker('a')])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('registerCustomMarker upserts by id', () => {
    const state = createMarkerState()
    state.actions.setCustomMarkers([createCustomMarker('a', { shape: 'circle' })])
    state.actions.registerCustomMarker(createCustomMarker('a', { shape: 'flag' }))
    state.actions.registerCustomMarker(createCustomMarker('b', { shape: 'diamond' }))

    const map = state.readonly.customMarkers.peek()
    expect(map.size).toBe(2)
    expect(map.get('a')!.shape).toBe('flag')
    expect(map.get('b')!.shape).toBe('diamond')
  })

  it('clearCustomMarkers empties the map', () => {
    const state = createMarkerState()
    state.actions.setCustomMarkers([createCustomMarker('a'), createCustomMarker('b')])
    state.actions.clearCustomMarkers()
    expect(state.readonly.customMarkers.peek().size).toBe(0)
  })

  it('rejects non JSON-like metadata', () => {
    const state = createMarkerState()
    expect(() =>
      state.actions.setCustomMarkers([createCustomMarker('a', { metadata: { d: new Date() } })]),
    ).toThrow(TypeError)
    expect(state.readonly.customMarkers.peek().size).toBe(0)
  })

  it('dispose resets to empty', () => {
    const state = createMarkerState()
    state.actions.setCustomMarkers([createCustomMarker('a')])
    state.dispose()
    expect(state.readonly.customMarkers.peek().size).toBe(0)
  })
})
