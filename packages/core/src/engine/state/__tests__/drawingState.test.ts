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
  it('defaults drawingTool to cursor', () => {
    const state = createDrawingState()
    expect(state.readonly.drawingTool.peek()).toBe('cursor')
  })

  it('setDrawingTool accepts DrawingToolId', () => {
    const state = createDrawingState()
    state.actions.setDrawingTool('trend-line')
    expect(state.readonly.drawingTool.peek()).toBe('trend-line')
  })

  it('freezes drawings snapshot so external mutation cannot corrupt SSOT', () => {
    const state = createDrawingState()
    const list = [
      mk('a', {
        style: { stroke: '#f00' },
        anchors: [{ id: 'p1', type: 'point', time: 1_000, price: 10 }],
      }),
    ]
    state.actions.setDrawings(list)
    list[0]!.id = 'hack'
    const stored = state.readonly.drawings.peek()[0]!
    expect(stored.id).toBe('a')
    expect(Object.isFrozen(stored)).toBe(true)
    expect(Object.isFrozen(stored.style)).toBe(true)
    expect(Object.isFrozen(stored.anchors)).toBe(true)
    expect(() => {
      ;(stored.anchors as { price: number }[])[0]!.price = 99
    }).toThrow()
  })

  it('preserves the axis semantics of stored anchors', () => {
    const state = createDrawingState()
    state.actions.setDrawings([
      mk('horizontal', {
        kind: 'horizontal-line',
        anchors: [{ id: 'h', type: 'horizontal', price: 10 }],
      }),
      mk('vertical', {
        kind: 'vertical-line',
        anchors: [{ id: 'v', type: 'vertical', time: 1_000, price: 0 }],
      }),
    ])

    expect(state.readonly.drawings.peek().map((drawing) => drawing.anchors[0]!.type)).toEqual([
      'horizontal',
      'vertical',
    ])
  })

  it('tracks selected drawing ids and removes ids absent from a replacement snapshot', () => {
    const state = createDrawingState()
    state.actions.setDrawings([mk('a'), mk('b')])
    state.actions.setSelectedDrawingIds(['a', 'b', 'a', 'missing'])
    expect(state.readonly.selectedDrawingIds.peek()).toEqual(['a', 'b'])

    state.actions.setDrawings([mk('b')])
    expect(state.readonly.selectedDrawingIds.peek()).toEqual(['b'])
  })

  it('setSelectedDrawingIds no-ops when unchanged', () => {
    const state = createDrawingState()
    state.actions.setDrawings([mk('a')])
    const listener = vi.fn()
    state.readonly.selectedDrawingIds.subscribe(listener)
    state.actions.setSelectedDrawingIds(['a'])
    state.actions.setSelectedDrawingIds(['a'])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('clearDrawings clears selection', () => {
    const state = createDrawingState()
    state.actions.setDrawings([mk('a')])
    state.actions.setSelectedDrawingIds(['a'])
    state.actions.clearDrawings()
    expect(state.readonly.drawings.peek()).toEqual([])
    expect(state.readonly.selectedDrawingIds.peek()).toEqual([])
  })
})
