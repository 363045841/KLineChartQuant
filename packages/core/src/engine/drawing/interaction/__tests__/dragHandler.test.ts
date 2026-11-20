/**
 * DragHandler 的锚点/整体拖拽行为。
 *
 * 覆盖：disjoint channel 镜像、flat line 端点约束、parallel channel 成对跟随、
 * 单锚点轴约束、磁吸、回归通道数据边界。夹具统一由 drawingTestKit 提供。
 */
import { describe, expect, it } from 'vitest'

import {
  CONTAINER,
  createAnchorDragDrawing,
  createDisjointChannelDrawing,
  createDrawingObject,
  createFlatLineDrawing,
  createFourBarTimelineAdapter,
  createMagnetAdapter,
  createMagnetConfig,
  createParallelChannelDrawing,
  pointerMove,
} from '../../__tests__/helpers/drawingTestKit'
import type { DrawingObject, PersistedDrawingAnchor } from '../../types'
import { DragHandler } from '../impl/DragHandler'
import { DrawingTool } from '../types'

/** 测试坐标约定：第 i 根 K 线 x = i*10+5，价格 p 对应 y = 200 - p。 */
const adapter = createFourBarTimelineAdapter()

/** 校验 disjoint channel 两端仍按相同 X 对齐、斜率互为相反数。 */
function expectMirroredChannel(anchors: DrawingObject['anchors']): void {
  expect(anchors[3]?.time).toEqual(anchors[0]?.time)
  expect(anchors[2]?.time).toEqual(anchors[1]?.time)
  expect((anchors[2]?.price ?? 0) - (anchors[3]?.price ?? 0)).toBeCloseTo(
    -((anchors[1]?.price ?? 0) - (anchors[0]?.price ?? 0)),
  )
}

describe('DragHandler disjoint channel', () => {
  it.each([
    {
      name: '拖动首锚点',
      target: { type: 'anchor', index: 0 } as const,
      start: { x: 5, y: 100 },
      pointer: { x: 25, y: 70 },
      times: [1_500, 1_000, 1_000, 1_500],
      prices: [130, 140, 20, 30],
    },
    {
      name: '拖动第二线端点',
      target: { type: 'anchor', index: 2 } as const,
      start: { x: 15, y: 180 },
      pointer: { x: 25, y: 60 },
      times: [500, 1_500, 1_500, 500],
      prices: [100, 20, 140, 60],
    },
    {
      name: '整体平移',
      target: { type: 'all' } as const,
      start: { x: 5, y: 100 },
      pointer: { x: 15, y: 70 },
      times: [1_000, 1_500, 1_500, 1_000],
      prices: [130, 170, 50, 90],
    },
  ])('$name 时保持镜像几何', ({ target, start, pointer, times, prices }) => {
    const handler = new DragHandler()
    handler.startDrag([createDisjointChannelDrawing()], target, start.x, start.y)

    const updated = handler.handleDragMove(pointerMove(pointer.x, pointer.y), CONTAINER, adapter)

    expect(updated?.[0]?.anchors.map((anchor) => anchor.time)).toEqual(times)
    expect(updated?.[0]?.anchors.map((anchor) => anchor.price)).toEqual(prices)
    expectMirroredChannel(updated![0]!.anchors)
  })
})

describe('DragHandler flat line', () => {
  it.each([
    {
      name: '拖动斜线端点，平线端点只跟随时间',
      startIndex: 0,
      start: { x: 5, y: 100 },
      pointer: { x: 12, y: 80 },
      prices: [120, 140, 60, 60],
      fixed: { anchor: 2, time: 1_000, price: 60 },
    },
    {
      name: '拖动平线端点，保持水平并只写价格',
      startIndex: 2,
      start: { x: 5, y: 140 },
      pointer: { x: 12, y: 110 },
      prices: [100, 140, 90, 90],
      fixed: { anchor: 0, time: 1_000, price: 100 },
    },
  ])('$name', ({ startIndex, start, pointer, prices, fixed }) => {
    const handler = new DragHandler()
    handler.startDrag([createFlatLineDrawing()], { type: 'anchor', index: startIndex }, start.x, start.y)

    const updated = handler.handleDragMove(pointerMove(pointer.x, pointer.y), CONTAINER, adapter)

    expect(updated?.[0]?.anchors.map((anchor) => anchor.price)).toEqual(prices)
    expect(updated?.[0]?.anchors[fixed.anchor]).toMatchObject({
      time: fixed.time,
      price: fixed.price,
    })
  })
})

describe('DragHandler parallel channel', () => {
  it('拖动一端时另一条线的同角色端点成对跟随，其余固定', () => {
    const handler = new DragHandler()
    // d 在屏幕 (15,100)，a/b/c 分别为 (5,100)/(15,60)/(5,140)。
    handler.startDrag([createParallelChannelDrawing()], { type: 'anchor', index: 3 }, 15, 100)

    const updated = handler.handleDragMove(pointerMove(15, 120), CONTAINER, adapter)

    expect(updated?.[0]?.anchors.map((anchor) => anchor.price)).toEqual([100, 120, 60, 80])
  })
})

describe('DragHandler 单锚点轴约束', () => {
  it.each([
    {
      name: '水平锚点只写价格',
      drawing: createDrawingObject({
        id: 'horizontal',
        kind: 'horizontal-line',
        anchors: [{ id: 'a', type: 'horizontal', price: 100 }],
      }),
      start: { x: 260, y: 100 },
      pointer: { x: 260, y: 80 },
      expected: { type: 'horizontal', price: 120 },
    },
    {
      name: '垂直锚点只写时间',
      drawing: createDrawingObject({
        id: 'vertical',
        kind: 'vertical-line',
        anchors: [{ id: 'a', type: 'vertical', time: 500 }],
      }),
      start: { x: 5, y: 200 },
      pointer: { x: 25, y: 200 },
      expected: { type: 'vertical', time: 1_500 },
    },
  ])('$name', ({ drawing, start, pointer, expected }) => {
    const handler = new DragHandler()
    handler.startDrag([drawing], { type: 'anchor', index: 0 }, start.x, start.y)

    const updated = handler.handleDragMove(pointerMove(pointer.x, pointer.y), CONTAINER, adapter)

    expect(updated?.[0]?.anchors[0]).toMatchObject(expected)
  })
})

describe('DragHandler magnet', () => {
  it('锚点拖拽在 strong 磁吸下落到 OHLC 的 Bar 中心', () => {
    const { adapter: magnetAdapter } = createMagnetAdapter()
    const handler = new DragHandler()
    handler.startDrag([createAnchorDragDrawing()], { type: 'anchor', index: 0 }, 15, 90)

    const updated = handler.handleDragMove(pointerMove(12, 83), CONTAINER, magnetAdapter, {
      magnet: createMagnetConfig('strong'),
    })
    expect(updated![0]!.anchors[0]).toMatchObject({ time: 1000, price: 120 })
  })

  it('磁吸关闭时使用原始指针坐标', () => {
    const { adapter: magnetAdapter } = createMagnetAdapter()
    const handler = new DragHandler()
    handler.startDrag([createAnchorDragDrawing()], { type: 'anchor', index: 0 }, 15, 90)

    const updated = handler.handleDragMove(pointerMove(12, 83), CONTAINER, magnetAdapter)
    expect(updated![0]!.anchors[0]).toMatchObject({ time: 1000, price: 117 })
  })

  it('整体拖拽不受磁吸影响', () => {
    const { adapter: magnetAdapter } = createMagnetAdapter()
    const handler = new DragHandler()
    handler.startDrag([createAnchorDragDrawing()], { type: 'all' }, 15, 90)

    const updated = handler.handleDragMove(pointerMove(12, 83), CONTAINER, magnetAdapter, {
      magnet: createMagnetConfig('strong'),
    })
    expect(updated![0]!.anchors[0]).toMatchObject({ time: 850, price: 117 })
  })

  it('拖拽中的图元被排除在候选之外', () => {
    const { adapter: magnetAdapter } = createMagnetAdapter()
    const drawing = createAnchorDragDrawing()
    const handler = new DragHandler()
    handler.startDrag([drawing], { type: 'anchor', index: 0 }, 15, 90)

    const lines = [{ drawingId: drawing.id, a: { x: 0, y: 60 }, b: { x: 100, y: 60 } }]
    const updated = handler.handleDragMove(pointerMove(12, 62), CONTAINER, magnetAdapter, {
      magnet: createMagnetConfig('weak', { lines }),
    })
    expect(updated![0]!.anchors[0]!.price).toBe(138)
    expect(handler.getSnapIndicator()).toBeNull()
  })
})

/** 构造回归通道；`reversed` 用于覆盖锚点存储顺序相反的情况。 */
function createRegressionDrawing(reversed: boolean) {
  const anchors: PersistedDrawingAnchor[] = [
    { id: 'older', type: 'point', time: 500, price: 100 },
    { id: 'newer', type: 'point', time: 1_500, price: 140 },
  ]
  return createDrawingObject({
    id: 'regression',
    kind: DrawingTool.RegressionChannel,
    anchors: reversed ? anchors.reverse() : anchors,
  })
}

describe('DragHandler regression channel data boundary', () => {
  it.each([false, true])('锚点顺序 reversed=%s 时夹住较新端点', (reversed) => {
    const drawing = createRegressionDrawing(reversed)
    const index = reversed ? 0 : 1
    const handler = new DragHandler()
    handler.startDrag([drawing], { type: 'anchor', index }, 25, 60)

    const updated = handler.handleDragMove(pointerMove(95, 80), CONTAINER, adapter)?.[0]
    expect(updated?.anchors[index]).toMatchObject({ time: 2_000, price: 120 })
    expect(updated?.anchors[1 - index]).toEqual(drawing.anchors[1 - index])

    // 越过最新数据只回到最新一根 K 线，不进入未来槽位。
    const returned = handler.handleDragMove(pointerMove(15, 80), CONTAINER, adapter)?.[0]
    expect(returned?.anchors[index]).toMatchObject({ time: 1_000 })
  })

  it.each([false, true])('整体拖拽 reversed=%s 时保持间隔', (reversed) => {
    const drawing = createRegressionDrawing(reversed)
    const handler = new DragHandler()
    handler.startDrag([drawing], { type: 'all' }, 15, 80)

    const updated = handler.handleDragMove(pointerMove(95, 100), CONTAINER, adapter)?.[0]
    expect(updated?.anchors.map((anchor) => anchor.time)).toEqual(
      reversed ? [2_000, 1_000] : [1_000, 2_000],
    )
    expect(updated?.anchors.map((anchor) => anchor.price)).toEqual(reversed ? [120, 80] : [80, 120])
  })

  it('普通趋势线端点仍可落在未来槽位', () => {
    const drawing = { ...createRegressionDrawing(false), kind: DrawingTool.TrendLine }
    const handler = new DragHandler()
    handler.startDrag([drawing], { type: 'anchor', index: 1 }, 25, 60)

    const updated = handler.handleDragMove(pointerMove(95, 80), CONTAINER, adapter)?.[0]
    expect(updated?.anchors[1]).toMatchObject({ time: 5_000 })
  })
})
