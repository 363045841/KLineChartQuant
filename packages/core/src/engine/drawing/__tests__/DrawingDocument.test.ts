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
    findAnchorAtTradingDate: (tradingDate) =>
      tradingDate === '2026-04-10' ? { timestamp: 1_000 } : null,
    hasPaneId: (paneId) => paneId === 'main',
    getWorkspaceId: () => 'kline',
  })
  return { state, document }
}

describe('DrawingDocument', () => {
  it('creates a horizontal line from price without requiring chart data at an anchor time', () => {
    const { document } = createDocument()

    const drawing = document.createDrawing({
      kind: 'horizontal-line',
      paneId: 'main',
      anchors: [{ price: 9 }],
    })

    expect(drawing.anchors).toEqual([expect.objectContaining({ price: 9 })])
  })

  it('creates an immutable drawing from time-price anchors', () => {
    const { state, document } = createDocument()

    const drawing = document.createDrawing({
      kind: 'trend-line',
      paneId: 'main',
      anchors: [
        { timestamp: 1_000, price: 10 },
        { timestamp: 1_000, price: 12 },
      ],
    })

    expect(drawing.anchors).toMatchObject([
      { time: 1_000, price: 10 },
      { time: 1_000, price: 12 },
    ])
    expect(drawing.workspaceId).toBe('kline')
    expect(state.readonly.drawings.peek()).toEqual([drawing])
    expect(Object.isFrozen(drawing)).toBe(true)
  })

  it('creates a drawing from trading-date anchors using the stored bar timestamp', () => {
    const { document } = createDocument()
    const drawing = document.createDrawing({
      kind: 'trend-line',
      paneId: 'main',
      anchors: [
        { tradingDate: '2026-04-10', price: 10 },
        { tradingDate: '2026-04-10', price: 12 },
      ],
    })

    expect(drawing.anchors).toMatchObject([
      { time: 1_000, price: 10 },
      { time: 1_000, price: 12 },
    ])
  })

  it('updates a drawing by id without replacing unrelated drawings', () => {
    const { document } = createDocument()
    const first = document.createDrawing({
      kind: 'trend-line',
      paneId: 'main',
      anchors: [
        { timestamp: 1_000, price: 10 },
        { timestamp: 1_000, price: 12 },
      ],
    })
    const second = document.createDrawing({
      kind: 'ray',
      paneId: 'main',
      anchors: [
        { timestamp: 1_000, price: 9 },
        { timestamp: 1_000, price: 11 },
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
        anchors: [{ timestamp: 1_000, price: 10 }],
      }),
    ).toThrow('requires exactly 2 anchors')
    expect(() =>
      document.createDrawing({
        kind: 'trend-line',
        paneId: 'main',
        anchors: [
          { timestamp: 1_000, price: 10 },
          { timestamp: 2_000, price: 12 },
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
        anchors: [{ timestamp: 1_000, price: 10 }],
      }),
    ).toThrow("Unknown drawing pane 'unknown'.")
  })

  it('removes selected drawings atomically', () => {
    const { state, document } = createDocument()
    const drawing = document.createDrawing({
      kind: 'horizontal-line',
      paneId: 'main',
      anchors: [{ timestamp: 1_000, price: 10 }],
    })
    state.actions.setSelectedDrawingIds([drawing.id])

    expect(document.removeDrawing(drawing.id)).toBe(true)
    expect(document.listDrawings()).toEqual([])
    expect(state.readonly.selectedDrawingIds.peek()).toEqual([])
  })

  it('updates a batch only when every requested style field is shared', () => {
    const { document } = createDocument()
    document.replaceDrawings([
      {
        id: 'a',
        kind: 'horizontal-line',
        paneId: 'main',
        visible: true,
        anchors: [],
        params: {},
        style: { stroke: '#2962ff', strokeWidth: 1 },
      },
      {
        id: 'b',
        kind: 'horizontal-line',
        paneId: 'main',
        visible: true,
        anchors: [],
        params: {},
        style: { stroke: '#f00' },
      },
    ])

    expect(document.getBatchStyleKeys(['a', 'b'])).toEqual(['stroke'])
    expect(document.updateBatch(['a', 'b'], { style: { strokeWidth: 3 } })).toEqual([])
    expect(document.listDrawings().map((drawing) => drawing.style.strokeWidth)).toEqual([
      1,
      undefined,
    ])

    expect(document.updateBatch(['a', 'b'], { style: { stroke: '#0f0' } })).toHaveLength(2)
    expect(document.listDrawings().map((drawing) => drawing.style.stroke)).toEqual(['#0f0', '#0f0'])
  })

  it('removes a batch and clears every removed id from the selection', () => {
    const { state, document } = createDocument()
    const first = document.createDrawing({
      kind: 'horizontal-line',
      paneId: 'main',
      anchors: [{ price: 10 }],
    })
    const second = document.createDrawing({
      kind: 'horizontal-line',
      paneId: 'main',
      anchors: [{ price: 11 }],
    })
    state.actions.setSelectedDrawingIds([first.id, second.id])

    expect(document.removeBatch([first.id, second.id])).toBe(true)
    expect(document.listDrawings()).toEqual([])
    expect(state.readonly.selectedDrawingIds.peek()).toEqual([])
  })

  it('commits resolved drag anchors without converting them through the external input model', () => {
    const { document } = createDocument()
    const drawing = document.createDrawing({
      kind: 'horizontal-line',
      paneId: 'main',
      anchors: [{ price: 10 }],
    })
    const anchors = [{ ...drawing.anchors[0]!, price: 11 }]

    expect(document.commitDrawingDrag(drawing.id, anchors)?.anchors).toEqual(anchors)
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
