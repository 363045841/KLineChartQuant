import { describe, expect, it, vi } from 'vitest'
import { DrawingState, mergePaint, PREVIEW_ID } from '../DrawingState'
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

function mockAdapter(
  initial: DrawingObject[] = [],
  initialSelected: string | null = null,
): DrawingChartAdapter & {
  kernelList: DrawingObject[]
  setDrawings: ReturnType<typeof vi.fn>
  requestDraw: ReturnType<typeof vi.fn>
} {
  let selected: string | null = initialSelected
  let kernelList = [...initial]
  const setDrawings = vi.fn((list: DrawingObject[]) => {
    kernelList = list.filter((d) => d.id !== PREVIEW_ID).map((d) => ({ ...d }))
  })
  const requestDraw = vi.fn()
  return {
    kernelList: kernelList as DrawingObject[],
    get kernel() {
      return kernelList
    },
    setDrawings,
    getFullDrawings: vi.fn(() => kernelList),
    setSelectedDrawingId: vi.fn((id: string | null) => {
      selected = id
    }),
    getSelectedDrawingId: vi.fn(() => selected),
    setDrawingToolId: vi.fn(),
    getDrawingToolId: vi.fn(() => 'cursor'),
    requestDraw,
    getViewport: vi.fn(() => null),
    getKWidthKGap: vi.fn(() => ({ kWidth: 6, kGap: 2 })),
    getCurrentDpr: vi.fn(() => 1),
    getData: vi.fn(() => []),
    getLogicalIndexAtX: vi.fn(() => null),
    getTimestampAtLogicalIndex: vi.fn(() => null),
    priceToY: vi.fn(() => 0),
    yToPrice: vi.fn(() => 0),
    getPaneInfo: vi.fn(() => undefined),
  } as any
}

describe('DrawingState session SSOT', () => {
  it('addOrUpdate commits to adapter without local full list', () => {
    const adapter = mockAdapter([mk('a')])
    const state = new DrawingState(adapter)
    state.addOrUpdate(mk('b'))
    expect(adapter.setDrawings).toHaveBeenCalled()
    const last = adapter.setDrawings.mock.calls.at(-1)![0] as DrawingObject[]
    expect(last.map((d) => d.id).sort()).toEqual(['a', 'b'])
    expect(state.getAll().map((d) => d.id).sort()).toEqual(['a', 'b'])
  })

  it('setPreview does not write kernel; only requestDraw', () => {
    const adapter = mockAdapter([mk('a')])
    const state = new DrawingState(adapter)
    adapter.setDrawings.mockClear()
    state.setPreview({ ...mk(PREVIEW_ID), id: PREVIEW_ID })
    expect(adapter.setDrawings).not.toHaveBeenCalled()
    expect(adapter.requestDraw).toHaveBeenCalled()
    expect(state.hasPreview()).toBe(true)
    expect(state.getPaintOverlay().map((d) => d.id)).toEqual([PREVIEW_ID])
    expect(state.getAll().map((d) => d.id)).toEqual(['a', PREVIEW_ID])
  })

  it('setDrawings strips preview id before kernel write', () => {
    const adapter = mockAdapter()
    const state = new DrawingState(adapter)
    state.setDrawings([mk('a'), { ...mk(PREVIEW_ID), id: PREVIEW_ID }])
    const last = adapter.setDrawings.mock.calls.at(-1)![0] as DrawingObject[]
    expect(last.map((d) => d.id)).toEqual(['a'])
  })

  it('getAll returns merge of kernel + overlay without mutating kernel', () => {
    const adapter = mockAdapter([mk('a')])
    const state = new DrawingState(adapter)
    state.setPreview({ ...mk(PREVIEW_ID), id: PREVIEW_ID })
    const all = state.getAll()
    all.push(mk('hack'))
    expect(adapter.getFullDrawings()).toHaveLength(1)
  })

  it('setSelected only writes adapter; getSelectedId reads adapter', () => {
    const adapter = mockAdapter([mk('a')])
    const state = new DrawingState(adapter)
    state.setSelected(mk('a'))
    expect(adapter.setSelectedDrawingId).toHaveBeenCalledWith('a')
    expect(state.getSelectedId()).toBe('a')
  })

  it('removeDrawing drops id and clears selection via adapter', () => {
    const adapter = mockAdapter([mk('a'), mk('b')], 'a')
    const state = new DrawingState(adapter)
    state.removeDrawing('a')
    expect(adapter.setSelectedDrawingId).toHaveBeenCalledWith(null)
    const last = adapter.setDrawings.mock.calls.at(-1)![0] as DrawingObject[]
    expect(last.map((d) => d.id)).toEqual(['b'])
  })

  it('setDragOverride does not write kernel; commitDrag writes once', () => {
    const adapter = mockAdapter([mk('a')])
    const state = new DrawingState(adapter)
    adapter.setDrawings.mockClear()
    const moved = { ...mk('a'), anchors: [{ id: 'p', index: 1, time: 1, price: 99 }] }
    state.setDragOverride(moved)
    expect(adapter.setDrawings).not.toHaveBeenCalled()
    expect(adapter.requestDraw).toHaveBeenCalled()
    state.commitDrag()
    expect(adapter.setDrawings).toHaveBeenCalledTimes(1)
    const last = adapter.setDrawings.mock.calls.at(-1)![0] as DrawingObject[]
    expect(last[0]!.anchors[0]!.price).toBe(99)
    expect(state.getPaintOverlay()).toEqual([])
  })

  it('mergePaint replaces by id and appends preview', () => {
    const a = mk('a')
    const a2 = { ...mk('a'), style: { stroke: '#f00' } }
    const p = { ...mk(PREVIEW_ID), id: PREVIEW_ID }
    expect(mergePaint([a], [a2, p]).map((d) => d.id)).toEqual(['a', PREVIEW_ID])
    expect(mergePaint([a], [a2, p])[0]!.style.stroke).toBe('#f00')
  })
})
