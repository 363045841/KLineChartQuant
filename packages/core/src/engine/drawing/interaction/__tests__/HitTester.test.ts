/** 验证单轴锚点图元的命中检测。 */
import { describe, expect, it } from 'vitest'
import {
  createDisjointChannelDrawing,
  createDrawingAdapter,
  createFlatLineDrawing,
  createFourBarTimelineAdapter,
  createParallelChannelDrawing,
  FOUR_BAR_TIMESTAMPS,
} from '../../__tests__/helpers/drawingTestKit'
import { LINE_LABEL_NORMAL_OFFSET } from '../../geometry/impl/labelLayout'
import type { DrawingObject } from '../../types'
import { HitTester } from '../impl/HitTester'

/** 创建垂直线命中检测所需的最小图表适配器。 */
function createAdapter() {
  return createDrawingAdapter({
    viewport: {
      getViewport: () => ({ scrollLeft: 0, plotWidth: 300, plotHeight: 240 }),
      getScreenXAtLogicalIndex: () => 137,
      getLogicalIndexAtTimestamp: () => 0,
      priceToY: (_paneId: string, price: number) => price,
      getPaneInfo: () => ({ paneId: 'main', top: 0, height: 240 }),
    },
  })
}

/** 创建具有不同横坐标的两锚点命中测试适配器。 */
function createLineAdapter() {
  return createDrawingAdapter({
    viewport: {
      getViewport: () => ({ scrollLeft: 0, plotWidth: 300, plotHeight: 240 }),
      getScreenXAtLogicalIndex: (index: number) => (index === 0 ? 20 : 220),
      getLogicalIndexAtTimestamp: (timestamp: number) => (timestamp === 1_000 ? 0 : 1),
      priceToY: (_paneId: string, price: number) => price,
      getPaneInfo: () => ({ paneId: 'main', top: 30, height: 240 }),
    },
  })
}

/** 通道锚点 i 的屏幕 X。 */
function anchorScreenX(index: number): number {
  return index * 50 + 20
}

/** 通道锚点 i 的屏幕 Y（价格 (i+1)*10，y = 200 - price）。 */
function anchorScreenY(index: number): number {
  return 200 - (index + 1) * 10
}

/** 构造通道类夹具共用的适配器：索引 i → x = i*50+20，y = 200 - price。 */
function createChannelAdapter() {
  return createFourBarTimelineAdapter({ getScreenXAtLogicalIndex: anchorScreenX })
}

/** 四锚点平行通道夹具：0/1 为第一条线，2/3 为第二条线。 */
function createChannelFixture() {
  const drawing = createParallelChannelDrawing({
    anchors: FOUR_BAR_TIMESTAMPS.map((time, index) => ({
      id: `a${index}`,
      type: 'point' as const,
      time,
      price: (index + 1) * 10,
    })),
  })
  return { drawing, adapter: createChannelAdapter() }
}

/** 平滑顶底夹具：0/1 为斜线两端，2/3 为水平线两端。 */
function createFlatLineFixture() {
  return { drawing: createFlatLineDrawing(), adapter: createChannelAdapter() }
}

/** 不相交通道夹具：0/1 为第一条线，2/3 为第二条线。 */
function createDisjointChannelFixture() {
  const drawing = createDisjointChannelDrawing({
    anchors: [
      { id: 'p1', type: 'point' as const, time: FOUR_BAR_TIMESTAMPS[0]!, price: 100 },
      { id: 'p2', type: 'point' as const, time: FOUR_BAR_TIMESTAMPS[1]!, price: 120 },
      { id: 'p3', type: 'point' as const, time: FOUR_BAR_TIMESTAMPS[0]!, price: 60 },
      { id: 'p4', type: 'point' as const, time: FOUR_BAR_TIMESTAMPS[1]!, price: 40 },
    ],
  })
  return { drawing, adapter: createChannelAdapter() }
}

describe('HitTester', () => {
  it('hits a vertical anchor along its full height', () => {
    const drawing: DrawingObject = {
      id: 'vertical',
      kind: 'vertical-line',
      paneId: 'main',
      visible: true,
      anchors: [{ id: 'anchor', type: 'vertical', time: 1_000, price: 20 }],
      params: {},
      style: {},
    }

    expect(new HitTester().hitTest(137, 120, [drawing], createAdapter())).toEqual({
      drawing,
      target: { type: 'all' },
    })
  })

  it('returns the Fibonacci line label target at its offset anchor', () => {
    const drawing: DrawingObject = {
      id: 'fib',
      kind: 'fib-retracement',
      paneId: 'main',
      visible: true,
      anchors: [
        { id: 'a', type: 'point', time: 1_000, price: 40 },
        { id: 'b', type: 'point', time: 2_000, price: 140 },
      ],
      labels: { line: { 3: { text: '50% text', position: 'center' } }, area: {} },
      params: {},
      style: {},
    }

    // 第 3 条线（50%）中点在 y=90，上侧法线偏移 6px 后为 y=84，再加 paneTop=30。
    expect(new HitTester().findLabelTarget(120, 84, [drawing], createLineAdapter())).toEqual({
      drawingId: 'fib',
      targetKind: 'line',
      lineIndex: 3,
      x: 120,
      y: 114,
      rotation: 0,
      text: '50% text',
      position: 'center',
      align: 'center',
      baseline: 'bottom',
      fontSize: 12,
    })
  })

  it('uses the two anchors rather than the extended ray for a label target', () => {
    const drawing: DrawingObject = {
      id: 'ray',
      kind: 'ray',
      paneId: 'main',
      visible: true,
      anchors: [
        { id: 'a', type: 'point', time: 1_000, price: 40 },
        { id: 'b', type: 'point', time: 2_000, price: 140 },
      ],
      params: {},
      style: {},
    }

    // 指针落在原始两锚点中点：命中锚点应仍在原线段法线外侧，而非延长线上。
    const target = new HitTester().findLabelTarget(120, 90, [drawing], createLineAdapter())
    const rotation = Math.atan2(100, 200)
    expect(target).toMatchObject({ drawingId: 'ray', targetKind: 'line', lineIndex: 0 })
    expect(target!.x).toBeCloseTo(120 + Math.sin(rotation) * LINE_LABEL_NORMAL_OFFSET, 5)
    expect(target!.y).toBeCloseTo(90 - Math.cos(rotation) * LINE_LABEL_NORMAL_OFFSET + 30, 5)
  })

  it('returns a text target at the center of a filled rectangle', () => {
    const drawing: DrawingObject = {
      id: 'rectangle',
      kind: 'rectangle',
      paneId: 'main',
      visible: true,
      anchors: [
        { id: 'a', type: 'point', time: 1_000, price: 40 },
        { id: 'b', type: 'point', time: 2_000, price: 140 },
      ],
      labels: { line: {}, area: { 0: { text: '区域文本', position: 'center' } } },
      params: {},
      style: {},
    }

    expect(new HitTester().findLabelTarget(120, 90, [drawing], createLineAdapter())).toMatchObject({
      drawingId: 'rectangle',
      targetKind: 'area',
      lineIndex: 0,
      x: 120,
      y: 120,
      text: '区域文本',
      align: 'center',
      baseline: 'middle',
      fontSize: 12,
    })
  })

  it('hits every persisted anchor of a parallel channel, including the derived fourth', () => {
    const { drawing, adapter } = createChannelFixture()

    // 锚点 i 的屏幕位置为 (i*50+20, 200 - price)，四个点均应可命中拖动。
    for (let index = 0; index < drawing.anchors.length; index++) {
      expect(
        new HitTester().hitTest(anchorScreenX(index), anchorScreenY(index), [drawing], adapter),
      ).toEqual({ drawing, target: { type: 'anchor', index } })
    }
  })

  it('hits the body of a parallel channel when the pointer lands on one of its lines', () => {
    const { drawing, adapter } = createChannelFixture()

    // 两条线的中点均远离四个锚点，命中只报告图元主体。
    expect(new HitTester().hitTest(45, 185, [drawing], adapter)).toEqual({
      drawing,
      target: { type: 'all' },
    })
    expect(new HitTester().hitTest(145, 165, [drawing], adapter)).toEqual({
      drawing,
      target: { type: 'all' },
    })
  })

  it('hits the body of a flat line when the pointer lands on one of its lines', () => {
    const { drawing, adapter } = createFlatLineFixture()

    // 斜线中点为 (45, 80)，水平线中点为 (45, 140)。
    expect(new HitTester().hitTest(45, 80, [drawing], adapter)).toEqual({
      drawing,
      target: { type: 'all' },
    })
    expect(new HitTester().hitTest(45, 140, [drawing], adapter)).toEqual({
      drawing,
      target: { type: 'all' },
    })
  })

  it('hits the body of a disjoint channel when the pointer lands on one of its lines', () => {
    const { drawing, adapter } = createDisjointChannelFixture()

    // 两条线的中点为 (45, 90) 与 (45, 150)，距离四个锚点均超过命中半径。
    expect(new HitTester().hitTest(45, 90, [drawing], adapter)).toEqual({
      drawing,
      target: { type: 'all' },
    })
    expect(new HitTester().hitTest(45, 150, [drawing], adapter)).toEqual({
      drawing,
      target: { type: 'all' },
    })
  })

  /**
   * 构造满足通道不变量的填充命中夹具；锚点顺序与物化结果一致。
   * 平行通道同端同 X（0↔2、1↔3），不相交通道同 X 配对相反（0↔3、1↔2）。
   */
  function createFillFixture(
    kind: 'parallel-channel' | 'disjoint-channel',
    anchors: ReadonlyArray<{ time: number; price: number }>,
  ): DrawingObject {
    return {
      id: kind,
      kind,
      paneId: 'main',
      visible: true,
      anchors: anchors.map((anchor, index) => ({
        id: `a${index}`,
        type: 'point' as const,
        ...anchor,
      })),
      params: {},
      style: {},
    }
  }

  it('hits the fill interior of a parallel channel away from its lines and anchors', () => {
    const drawing = createFillFixture('parallel-channel', [
      { time: 500, price: 100 },
      { time: 1_000, price: 120 },
      { time: 500, price: 60 },
      { time: 1_000, price: 40 },
    ])

    // 内部点 (45, 120) 距两条线的中点 (45, 90) / (45, 150) 与四个锚点均超过命中半径。
    expect(new HitTester().hitTest(45, 120, [drawing], createChannelAdapter())).toEqual({
      drawing,
      target: { type: 'all' },
    })
  })

  it('hits the fill interior of a flat line away from its lines and anchors', () => {
    const { drawing, adapter } = createFlatLineFixture()

    // 斜线与水平线的中点为 (45, 80) / (45, 140)，内部点取包围盒中心。
    expect(new HitTester().hitTest(45, 110, [drawing], adapter)).toEqual({
      drawing,
      target: { type: 'all' },
    })
  })

  it('hits the fill interior of a disjoint channel with the reversed same-X pairing', () => {
    const drawing = createFillFixture('disjoint-channel', [
      { time: 500, price: 100 },
      { time: 1_000, price: 80 },
      { time: 1_000, price: 140 },
      { time: 500, price: 160 },
    ])

    // 第二条线由右向左，内部点 (45, 80) 仍应命中；错误的环绕顺序会判成自交多边形而落空。
    expect(new HitTester().hitTest(45, 80, [drawing], createChannelAdapter())).toEqual({
      drawing,
      target: { type: 'all' },
    })
  })

  it('hits the line midpoint handle of a selected drawing, and the body otherwise', () => {
    const { drawing, adapter } = createFlatLineFixture()
    const selected = new Set([drawing.id])

    // 斜线中点 (45, 80)、水平线中点 (45, 140)：命中报告线在 LINES 表中的下标。
    expect(new HitTester().hitTest(45, 80, [drawing], adapter, selected)).toEqual({
      drawing,
      target: { type: 'vertical-handle', lineIndex: 0 },
    })
    expect(new HitTester().hitTest(45, 140, [drawing], adapter, selected)).toEqual({
      drawing,
      target: { type: 'vertical-handle', lineIndex: 1 },
    })
    // 手柄只在选中态可见：未选中时中点按线身命中 → 整体拖拽。
    expect(new HitTester().hitTest(45, 80, [drawing], adapter)).toEqual({
      drawing,
      target: { type: 'all' },
    })
  })

  it('prefers a line label over the area center when both are in range', () => {
    const drawing: DrawingObject = {
      id: 'flat-rectangle',
      kind: 'rectangle',
      paneId: 'main',
      visible: true,
      anchors: [
        { id: 'a', type: 'point', time: 1_000, price: 80 },
        { id: 'b', type: 'point', time: 2_000, price: 100 },
      ],
      labels: { line: { 2: { text: '边文本', position: 'center' } }, area: {} },
      params: {},
      style: {},
    }

    // 指针落在底边文字锚点上，区域中心（距 4px）也在热点半径内：line 优先。
    expect(new HitTester().findLabelTarget(120, 94, [drawing], createLineAdapter())).toMatchObject({
      drawingId: 'flat-rectangle',
      targetKind: 'line',
      lineIndex: 2,
      x: 120,
      y: 124,
      text: '边文本',
      align: 'center',
      baseline: 'bottom',
    })
  })
})
