import { describe, expect, it, vi } from 'vitest'

import type { DrawingObject } from '../../../foundation/plugin/index'
import { createDrawingState } from '../drawingState'

function mk(id: string, overrides: Partial<DrawingObject> = {}): DrawingObject {
  return {
    id,
    kind: 'trend-line',
    paneId: 'main',
    visible: true,
    anchors: [],
    params: {},
    style: { stroke: '#2962ff' },
    ...overrides,
  }
}

describe('drawingState', () => {
  it('freezes drawings snapshot so external mutation cannot corrupt SSOT', () => {
    const state = createDrawingState()
    const list = [mk('a', { style: { stroke: '#f00' } })]
    state.actions.setDrawings(list)
    list[0]!.id = 'hack'
    const stored = state.readonly.drawings.peek()[0]!
    expect(stored.id).toBe('a')
    expect(Object.isFrozen(stored)).toBe(true)
  })

  it('tracks selectedDrawingId and clears when drawing removed via setDrawings', () => {
    const state = createDrawingState()
    state.actions.setDrawings([mk('a'), mk('b')])
    state.actions.setSelectedDrawingId('a')
    expect(state.readonly.selectedDrawingId.peek()).toBe('a')

    state.actions.setDrawings([mk('b')])
    expect(state.readonly.selectedDrawingId.peek()).toBeNull()
  })

  it('setSelectedDrawingId no-ops when unchanged', () => {
    const state = createDrawingState()
    state.actions.setDrawings([mk('a')])
    const listener = vi.fn()
    state.readonly.selectedDrawingId.subscribe(listener)
    state.actions.setSelectedDrawingId('a')
    state.actions.setSelectedDrawingId('a')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('clearDrawings clears selection', () => {
    const state = createDrawingState()
    state.actions.setDrawings([mk('a')])
    state.actions.setSelectedDrawingId('a')
    state.actions.clearDrawings()
    expect(state.readonly.drawings.peek()).toEqual([])
    expect(state.readonly.selectedDrawingId.peek()).toBeNull()
  })
})
