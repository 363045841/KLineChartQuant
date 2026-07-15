import { describe, expect, it, vi } from 'vitest'
import { DrawingState } from '../DrawingState'
import type { DrawingChartAdapter } from '../../../controllers/types'
import type { DrawingObject } from '../../../foundation/plugin/index'

function mk(id: string): DrawingObject {
  return {
    id,
    kind: 'trend-line',
    paneId: 'main',
    visible: true,
    anchors: [],
    params: {},
    style: { stroke: '#2962ff' },
  }
}

function mockAdapter(initialSelected: string | null = null): DrawingChartAdapter {
  let selected: string | null = initialSelected
  return {
    setDrawings: vi.fn(),
    getFullDrawings: vi.fn(() => []),
    setSelectedDrawingId: vi.fn((id: string | null) => {
      selected = id
    }),
    getSelectedDrawingId: vi.fn(() => selected),
    setDrawingToolId: vi.fn(),
    getDrawingToolId: vi.fn(() => 'cursor'),
    getViewport: vi.fn(() => null),
    getKWidthKGap: vi.fn(() => ({ kWidth: 6, kGap: 2 })),
    getCurrentDpr: vi.fn(() => 1),
    getData: vi.fn(() => []),
    getLogicalIndexAtX: vi.fn(() => null),
    getTimestampAtLogicalIndex: vi.fn(() => null),
    priceToY: vi.fn(() => 0),
    yToPrice: vi.fn(() => 0),
    getPaneInfo: vi.fn(() => undefined),
  }
}

describe('DrawingState work copy', () => {
  it('addOrUpdate works after setDrawings from frozen kernel snapshot', () => {
    const adapter = mockAdapter()
    const state = new DrawingState(adapter)
    const frozen = Object.freeze([Object.freeze(mk('a'))]) as DrawingObject[]
    state.setDrawings(frozen)
    expect(() => state.addOrUpdate(mk('b'))).not.toThrow()
    expect(state.getAll().map((d) => d.id).sort()).toEqual(['a', 'b'])
  })

  it('setPreview works after setDrawings from frozen snapshot', () => {
    const adapter = mockAdapter()
    const state = new DrawingState(adapter)
    state.setDrawings(Object.freeze([Object.freeze(mk('a'))]) as DrawingObject[])
    expect(() =>
      state.setPreview({
        ...mk('__preview__'),
        id: '__preview__',
      }),
    ).not.toThrow()
    expect(state.hasPreview()).toBe(true)
  })

  it('getAll returns a copy so push on result does not mutate internal', () => {
    const adapter = mockAdapter()
    const state = new DrawingState(adapter)
    state.setDrawings([mk('a')])
    const all = state.getAll()
    all.push(mk('hack'))
    expect(state.getAll()).toHaveLength(1)
  })

  it('setSelected only writes adapter; getSelectedId reads adapter', () => {
    const adapter = mockAdapter()
    const state = new DrawingState(adapter)
    state.setDrawings([mk('a')])
    state.setSelected(mk('a'))
    expect(adapter.setSelectedDrawingId).toHaveBeenCalledWith('a')
    expect(state.getSelectedId()).toBe('a')
  })

  it('removeDrawing drops id and clears selection via adapter', () => {
    const adapter = mockAdapter('a')
    const state = new DrawingState(adapter)
    state.setDrawings([mk('a'), mk('b')])
    state.removeDrawing('a')
    expect(state.getAll().map((d) => d.id)).toEqual(['b'])
    expect(adapter.setSelectedDrawingId).toHaveBeenCalledWith(null)
    expect(adapter.setDrawings).toHaveBeenCalled()
  })
  it('nested fields from frozen snapshot are mutable after adopt', () => {
    const adapter = mockAdapter()
    const state = new DrawingState(adapter)
    const frozen = Object.freeze([
      Object.freeze({
        ...mk('a'),
        anchors: Object.freeze([Object.freeze({ id: 'p1', index: 0, price: 1 })]),
        style: Object.freeze({ stroke: '#f00' }),
      }),
    ]) as DrawingObject[]
    state.setDrawings(frozen)
    const d = state.getById('a')!
    expect(() => {
      d.anchors[0]!.price = 99
      d.style.stroke = '#0f0'
    }).not.toThrow()
    expect(d.anchors[0]!.price).toBe(99)
  })
})
