// 本文件验证绘图文档将声明式 CRUD 原子提交到 drawingState。
import { describe, expect, it } from 'vitest'

import { createDrawingState } from '../../state/drawingState'
import { DrawingDocument } from '../DrawingDocument'
import { PREVIEW_ID } from '../DrawingState'

function createDocument() {
  const state = createDrawingState()
  const document = new DrawingDocument({
    drawingState: state,
    getLogicalIndexAtTimestamp: (timestamp) => (timestamp === 1_000 ? 4 : null),
    hasPaneId: (paneId) => paneId === 'main',
  })
  return { state, document }
}

describe('DrawingDocument', () => {
  it('creates an immutable drawing from time-price anchors', () => {
    const { state, document } = createDocument()

    const drawing = document.createDrawing({
      kind: 'trend-line',
      paneId: 'main',
      anchors: [
        { time: 1_000, price: 10 },
        { time: 1_000, price: 12 },
      ],
    })

    expect(drawing.anchors).toMatchObject([
      { index: 4, time: 1_000, price: 10 },
      { index: 4, time: 1_000, price: 12 },
    ])
    expect(state.readonly.drawings.peek()).toEqual([drawing])
    expect(Object.isFrozen(drawing)).toBe(true)
  })

  it('updates a drawing by id without replacing unrelated drawings', () => {
    const { document } = createDocument()
    const first = document.createDrawing({
      kind: 'trend-line',
      paneId: 'main',
      anchors: [
        { time: 1_000, price: 10 },
        { time: 1_000, price: 12 },
      ],
    })
    const second = document.createDrawing({
      kind: 'ray',
      paneId: 'main',
      anchors: [
        { time: 1_000, price: 9 },
        { time: 1_000, price: 11 },
      ],
    })

    const updated = document.updateDrawing(first.id, { style: { strokeWidth: 3 } })

    expect(updated?.style.strokeWidth).toBe(3)
    expect(document.listDrawings().map((drawing) => drawing.id)).toEqual([first.id, second.id])
  })

  it('rejects invalid anchors before changing the document', () => {
    const { document } = createDocument()

    expect(() =>
      document.createDrawing({
        kind: 'trend-line',
        paneId: 'main',
        anchors: [{ time: 1_000, price: 10 }],
      }),
    ).toThrow('requires exactly 2 anchors')
    expect(() =>
      document.createDrawing({
        kind: 'trend-line',
        paneId: 'main',
        anchors: [
          { time: 1_000, price: 10 },
          { time: 2_000, price: 12 },
        ],
      }),
    ).toThrow('No chart data exists')
    expect(document.listDrawings()).toEqual([])
  })

  it('rejects drawing creation for an unknown pane', () => {
    const { document } = createDocument()

    expect(() =>
      document.createDrawing({
        kind: 'horizontal-line',
        paneId: 'unknown',
        anchors: [{ time: 1_000, price: 10 }],
      }),
    ).toThrow("Unknown drawing pane 'unknown'.")
  })

  it('removes selected drawings atomically', () => {
    const { state, document } = createDocument()
    const drawing = document.createDrawing({
      kind: 'horizontal-line',
      paneId: 'main',
      anchors: [{ time: 1_000, price: 10 }],
    })
    state.actions.setSelectedDrawingId(drawing.id)

    expect(document.removeDrawing(drawing.id)).toBe(true)
    expect(document.listDrawings()).toEqual([])
    expect(state.readonly.selectedDrawingId.peek()).toBeNull()
  })

  it('does not persist session preview objects through document replacement', () => {
    const { document } = createDocument()

    document.replaceDrawings([
      {
        id: PREVIEW_ID,
        kind: 'trend-line',
        paneId: 'main',
        visible: true,
        anchors: [],
        params: {},
        style: {},
      },
    ])

    expect(document.listDrawings()).toEqual([])
  })
})
