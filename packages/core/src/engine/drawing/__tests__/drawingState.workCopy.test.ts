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
  replaceDrawings: ReturnType<typeof vi.fn>
  updateDrawing: ReturnType<typeof vi.fn>
  requestDraw: ReturnType<typeof vi.fn>
} {
  let selected: string | null = initialSelected
  let kernelList = [...initial]
  const replaceDrawings = vi.fn((list: DrawingObject[]) => {
    kernelList = list.filter((d) => d.id !== PREVIEW_ID).map((d) => ({ ...d }))
  })
  const updateDrawing = vi.fn(
    (id: string, patch: { anchors?: Array<{ time: number; price: number }> }) => {
      const index = kernelList.findIndex((drawing) => drawing.id === id)
      if (index === -1 || !patch.anchors) return null
      const current = kernelList[index]!
      const next = {
        ...current,
        anchors: patch.anchors.map((anchor, anchorIndex) => ({
          id: current.anchors[anchorIndex]?.id ?? `p-${anchorIndex}`,
          index: anchor.time,
          ...anchor,
        })),
      }
      kernelList[index] = next
      return next
    },
  )
  const requestDraw = vi.fn()
  return {
    kernelList: kernelList as DrawingObject[],
    get kernel() {
      return kernelList
    },
    replaceDrawings,
    createDrawing: vi.fn(() => mk('created')),
    updateDrawing,
    removeDrawing: vi.fn(() => false),
    clearDrawings: vi.fn(),
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
  it('setPreview does not write kernel; only requestDraw', () => {
    const adapter = mockAdapter([mk('a')])
    const state = new DrawingState(adapter)
    adapter.replaceDrawings.mockClear()
    state.setPreview({ ...mk(PREVIEW_ID), id: PREVIEW_ID })
    expect(adapter.replaceDrawings).not.toHaveBeenCalled()
    expect(adapter.requestDraw).toHaveBeenCalled()
    expect(state.hasPreview()).toBe(true)
    expect(state.getPaintOverlay().map((d) => d.id)).toEqual([PREVIEW_ID])
    expect(state.getAll().map((d) => d.id)).toEqual(['a', PREVIEW_ID])
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

  it('setDragOverride does not write kernel; commitDrag delegates an anchor patch once', () => {
    const adapter = mockAdapter([mk('a')])
    const state = new DrawingState(adapter)
    adapter.updateDrawing.mockClear()
    const moved = { ...mk('a'), anchors: [{ id: 'p', index: 1, time: 1, price: 99 }] }
    state.setDragOverride(moved)
    expect(adapter.updateDrawing).not.toHaveBeenCalled()
    expect(adapter.requestDraw).toHaveBeenCalled()
    state.commitDrag()
    expect(adapter.updateDrawing).toHaveBeenCalledWith('a', {
      anchors: [{ time: 1, price: 99 }],
    })
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
