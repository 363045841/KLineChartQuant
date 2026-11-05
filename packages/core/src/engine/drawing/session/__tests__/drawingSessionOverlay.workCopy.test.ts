import { describe, expect, it, vi } from 'vitest'

import { createDrawingAdapter, createTrendLine } from '../../__tests__/helpers/drawingTestKit'
import type { DrawingObject } from '../../types'
import { DrawingSessionOverlay, mergePaint, PREVIEW_ID } from '../impl/DrawingSessionOverlay'

/** 构造由内存 kernel 列表承载文档状态的适配器；其余 port 复用测试工具默认值。 */
function mockAdapter(initial: DrawingObject[] = [], initialSelected: string[] = []) {
  let selected = [...initialSelected]
  let kernelList = [...initial]
  return createDrawingAdapter(
    {
      document: {
        replaceDrawings: vi.fn((list: ReadonlyArray<DrawingObject>) => {
          kernelList = list
            .filter((drawing) => drawing.id !== PREVIEW_ID)
            .map((drawing) => ({ ...drawing }))
        }),
        getFullDrawings: () => kernelList,
        setSelectedDrawingIds: vi.fn((ids: ReadonlyArray<string>) => {
          selected = [...ids]
        }),
        getSelectedDrawingIds: () => selected,
      },
    },
    initial,
  )
}

describe('DrawingSessionOverlay session SSOT', () => {
  it('setPreview does not write kernel; only requestDraw', () => {
    const adapter = mockAdapter([createTrendLine('a')])
    const state = new DrawingSessionOverlay(adapter)
    vi.mocked(adapter.replaceDrawings).mockClear()
    state.setPreview({ ...createTrendLine(PREVIEW_ID), id: PREVIEW_ID })
    expect(adapter.replaceDrawings).not.toHaveBeenCalled()
    expect(adapter.requestDraw).toHaveBeenCalled()
    expect(state.hasPreview()).toBe(true)
    expect(state.getPaintOverlay().map((d) => d.id)).toEqual([PREVIEW_ID])
    expect(state.getAll().map((d) => d.id)).toEqual(['a', PREVIEW_ID])
  })

  it('getAll returns merge of kernel + overlay without mutating kernel', () => {
    const adapter = mockAdapter([createTrendLine('a')])
    const state = new DrawingSessionOverlay(adapter)
    state.setPreview({ ...createTrendLine(PREVIEW_ID), id: PREVIEW_ID })
    const all = state.getAll()
    all.push(createTrendLine('hack'))
    expect(adapter.getFullDrawings()).toHaveLength(1)
  })

  it('setSelected only writes adapter; getSelectedDrawings reads adapter', () => {
    const adapter = mockAdapter([createTrendLine('a')])
    const state = new DrawingSessionOverlay(adapter)
    state.setSelected([createTrendLine('a')])
    expect(adapter.setSelectedDrawingIds).toHaveBeenCalledWith(['a'])
    expect(state.getSelectedDrawings().map((drawing) => drawing.id)).toEqual(['a'])
  })

  it('setDragOverride does not write kernel; commitDrag delegates resolved anchors once', () => {
    const adapter = mockAdapter([createTrendLine('a')])
    const state = new DrawingSessionOverlay(adapter)
    vi.mocked(adapter.commitDrawingDrag).mockClear()
    const moved = { ...createTrendLine('a'), anchors: [{ id: 'p', time: 1, price: 99 }] }
    state.setDragOverride(moved)
    expect(adapter.commitDrawingDrag).not.toHaveBeenCalled()
    expect(adapter.requestDraw).toHaveBeenCalled()
    state.commitDrag()
    expect(adapter.commitDrawingDrag).toHaveBeenCalledWith('a', moved.anchors)
    expect(state.getPaintOverlay()).toEqual([])
  })

  it('mergePaint replaces by id and appends preview', () => {
    const a = createTrendLine('a')
    const a2 = { ...createTrendLine('a'), style: { stroke: '#f00' } }
    const p = { ...createTrendLine(PREVIEW_ID), id: PREVIEW_ID }
    expect(mergePaint([a], [a2, p]).map((d) => d.id)).toEqual(['a', PREVIEW_ID])
    expect(mergePaint([a], [a2, p])[0]!.style.stroke).toBe('#f00')
  })
})
