// 本文件验证绘图文档将声明式 CRUD 原子提交到 drawingState。
import { describe, expect, it } from 'vitest'

import { createDrawingState } from '../../../state/drawingState'
import { PREVIEW_ID } from '../../session/impl/DrawingState'
import { DrawingDocument } from '../impl/DrawingDocument'

function createDocument() {
  const state = createDrawingState()
  // 五个 Bar 的时间轴：锚点 1_000 落在索引 4，派生锚点仍可落在数据范围内。
  const timestamps = [0, 250, 500, 750, 1_000]
  const document = new DrawingDocument({
    drawingState: state,
    getLogicalIndexAtTimestamp: (timestamp) => {
      const index = timestamps.indexOf(timestamp)
      return index === -1 ? null : index
    },
    getDrawingTimestampAtLogicalIndex: (index) => timestamps[index] ?? null,
    getDrawingData: () => timestamps.map((timestamp) => ({ timestamp })),
    findAnchorAtTradingDate: (tradingDate) =>
      tradingDate === '2026-04-10'
        ? { kind: 'resolved', timestamp: 1_000 }
        : { kind: 'not-trading' },
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

  it('persists the derived parallel-channel anchor and accepts it on drag', () => {
    const { document } = createDocument()

    const drawing = document.createDrawing({
      kind: 'parallel-channel',
      paneId: 'main',
      anchors: [
        { timestamp: 1_000, price: 10 },
        { timestamp: 1_000, price: 20 },
        { timestamp: 1_000, price: 30 },
      ],
    })

    // 第三个输入价格落在 3（次点 X），2（首点 X）按首两点增量反向回推为 20。
    expect(drawing.anchors).toHaveLength(4)
    expect(drawing.anchors[2]).toMatchObject({ time: 1_000, price: 20 })
    expect(drawing.anchors[3]).toMatchObject({ time: 1_000, price: 30 })

    const moved = drawing.anchors.map((anchor) => ({ ...anchor, price: anchor.price + 1 }))
    expect(document.commitDrawingDrag(drawing.id, moved)?.anchors[2]).toMatchObject({ price: 21 })
  })

  it('selects the new drawing and drops the previous selection', () => {
    const { state, document } = createDocument()

    const first = document.createDrawing({
      kind: 'horizontal-line',
      paneId: 'main',
      anchors: [{ price: 9 }],
    })
    expect(state.readonly.selectedDrawingIds.peek()).toEqual([first.id])

    const second = document.createDrawing({
      kind: 'horizontal-line',
      paneId: 'main',
      anchors: [{ price: 10 }],
    })
    expect(state.readonly.selectedDrawingIds.peek()).toEqual([second.id])
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

  it('stores user newlines as the shared literal drawing newline control code', () => {
    const { document } = createDocument()

    const drawing = document.createDrawing({
      kind: 'trend-line',
      paneId: 'main',
      anchors: [
        { timestamp: 1_000, price: 10 },
        { timestamp: 1_000, price: 12 },
      ],
      labels: { line: { 0: { text: '支撑位\n跌破则止损', position: 'center' } }, area: {} },
    })

    expect(drawing.labels?.line['0']?.text).toBe('支撑位\\n跌破则止损')
  })

  it('normalizes label newlines when updating and importing drawings', () => {
    const { document } = createDocument()
    const drawing = document.createDrawing({
      kind: 'trend-line',
      paneId: 'main',
      anchors: [
        { timestamp: 1_000, price: 10 },
        { timestamp: 1_000, price: 12 },
      ],
    })

    const updated = document.updateDrawing({
      ...drawing,
      labels: { line: { 0: { text: '更新\r\n标签', position: 'center' } }, area: {} },
    })
    expect(updated?.labels?.line['0']?.text).toBe('更新\\n标签')

    document.replaceDrawings([
      {
        ...updated!,
        labels: { line: {}, area: { 0: { text: '导入\n标签', position: 'center' } } },
      },
    ])
    expect(document.getDrawing(drawing.id)?.labels?.area['0']?.text).toBe('导入\\n标签')
  })

  it('persists a future-slot anchor from its existing base bar', () => {
    const { document } = createDocument()

    const drawing = document.createDrawing({
      kind: 'trend-line',
      paneId: 'main',
      anchors: [
        { timestamp: 1_000, price: 10 },
        { timestamp: 1_000, futureOffset: 3, price: 12 },
      ],
    })

    expect(drawing.anchors[1]).toMatchObject({ time: 1_000, futureOffset: 3, price: 12 })
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

    const updated = document.updateDrawing({
      ...first,
      style: { ...first.style, strokeWidth: 3 },
    })

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
    expect(() =>
      document.createDrawing({
        kind: 'trend-line',
        paneId: 'main',
        anchors: [
          { timestamp: 1_000, futureOffset: 0, price: 10 },
          { timestamp: 1_000, price: 12 },
        ],
      }),
    ).toThrow('future offset must be a positive integer')
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

  it('commits multiple drag updates atomically', () => {
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
      kind: 'trend-line',
      paneId: 'main',
      anchors: [
        { timestamp: 1_000, price: 20 },
        { timestamp: 1_000, price: 22 },
      ],
    })
    const before = document.listDrawings()

    expect(
      document.commitDrawingDrags([
        { id: first.id, anchors: first.anchors.map((anchor) => ({ ...anchor, price: 11 })) },
        { id: second.id, anchors: [{ ...second.anchors[0]!, price: 21 }] },
      ]),
    ).toEqual([])
    expect(document.listDrawings()).toEqual(before)

    expect(
      document
        .commitDrawingDrags([
          { id: first.id, anchors: first.anchors.map((anchor) => ({ ...anchor, price: 11 })) },
          { id: second.id, anchors: second.anchors.map((anchor) => ({ ...anchor, price: 21 })) },
        ])
        .map((drawing) => drawing.id),
    ).toEqual([first.id, second.id])
    expect(document.getDrawing(first.id)?.anchors[0]?.price).toBe(11)
    expect(document.getDrawing(second.id)?.anchors[0]?.price).toBe(21)
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

  it('treats fill as batch-modifiable only for all-channel selections', () => {
    const { document } = createDocument()
    document.replaceDrawings([
      {
        id: 'rect',
        kind: 'rectangle',
        paneId: 'main',
        visible: true,
        anchors: [],
        params: {},
        style: { stroke: '#2962ff', strokeWidth: 1, fillOpacity: 0.1 },
      },
      {
        id: 'line',
        kind: 'trend-line',
        paneId: 'main',
        visible: true,
        anchors: [],
        params: {},
        style: { stroke: '#f00', strokeWidth: 1 },
      },
      {
        id: 'channel',
        kind: 'parallel-channel',
        paneId: 'main',
        visible: true,
        anchors: [],
        params: {},
        style: { stroke: '#0f0', strokeWidth: 1, fillOpacity: 0.1 },
      },
    ])

    // 全通道类集合：fill 可批量修改，style 上无需显式存在该键。
    expect(document.getBatchStyleKeys(['rect', 'channel'])).toContain('fill')
    expect(document.updateBatch(['rect', 'channel'], { style: { fill: '#ff0' } })).toHaveLength(2)
    expect(document.listDrawings().map((drawing) => drawing.style.fill)).toEqual([
      '#ff0',
      undefined,
      '#ff0',
    ])

    // 通道类与线类混合集合：线类渲染端不消费 fill，维持交集守卫拒绝。
    expect(document.getBatchStyleKeys(['rect', 'line'])).not.toContain('fill')
    expect(document.updateBatch(['rect', 'line'], { style: { fill: '#fff' } })).toEqual([])
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

  it('locks only anchor changes, drag and removal while keeping every other edit writable', () => {
    const { document } = createDocument()
    const drawing = document.createDrawing({
      kind: 'horizontal-line',
      paneId: 'main',
      anchors: [{ price: 10 }],
    })
    document.updateDrawingFromInput(drawing.id, { locked: true })

    // 样式/显隐/zIndex/解锁均照常写入。
    expect(
      document.updateDrawingFromInput(drawing.id, { style: { stroke: '#f00' } }),
    ).not.toBeNull()
    expect(document.updateBatch([drawing.id], { visible: false })[0]?.visible).toBe(false)
    expect(document.updateBatch([drawing.id], { zIndex: 3 })[0]?.zIndex).toBe(3)

    // 锚点未变时全量快照可写（标签编辑走该路径），锚点一变即拒绝。
    const current = document.getDrawing(drawing.id)!
    expect(
      document.updateDrawing({ ...current, style: { ...current.style, strokeWidth: 2 } }),
    ).not.toBeNull()
    expect(
      document.updateDrawing({
        ...current,
        anchors: [{ ...current.anchors[0]!, price: 11 }],
      }),
    ).toBeNull()
    expect(document.updateDrawingFromInput(drawing.id, { anchors: [{ price: 11 }] })).toBeNull()

    // 拖动与删除仍然被冻结。
    expect(
      document.commitDrawingDrag(drawing.id, [{ ...current.anchors[0]!, price: 11 }]),
    ).toBeNull()
    expect(document.removeDrawing(drawing.id)).toBe(false)

    expect(document.updateBatch([drawing.id], { locked: false })).toHaveLength(1)
    expect(document.getDrawing(drawing.id)?.locked).toBe(false)
  })

  it('updates locked targets together with the rest in a batch', () => {
    const { document } = createDocument()
    const locked = document.createDrawing({
      kind: 'horizontal-line',
      paneId: 'main',
      anchors: [{ price: 10 }],
    })
    const free = document.createDrawing({
      kind: 'horizontal-line',
      paneId: 'main',
      anchors: [{ price: 11 }],
    })
    document.updateBatch([locked.id], { locked: true })

    expect(document.updateBatch([locked.id, free.id], { style: { stroke: '#f00' } })).toHaveLength(
      2,
    )
    expect(document.getDrawing(locked.id)?.style.stroke).toBe('#f00')
    expect(document.getDrawing(free.id)?.style.stroke).toBe('#f00')
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
