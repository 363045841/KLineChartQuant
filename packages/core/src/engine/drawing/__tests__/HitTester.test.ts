/** 验证单轴锚点图元的命中检测。 */
import { describe, expect, it } from 'vitest'

import type { DrawingChartAdapter } from '../../../controllers/types'
import type { DrawingObject } from '../../../foundation/plugin'
import { HitTester } from '../HitTester'
import { LINE_LABEL_NORMAL_OFFSET } from '../labelLayout'

/** 创建垂直线命中检测所需的最小图表适配器。 */
function createAdapter(): DrawingChartAdapter {
  return {
    getViewport: () => ({ scrollLeft: 0, plotWidth: 300, plotHeight: 240 }),
    getScreenXAtLogicalIndex: () => 137,
    getLogicalIndexAtTimestamp: () => 0,
    priceToY: (_paneId: string, price: number) => price,
    getPaneInfo: () => ({ paneId: 'main', top: 0, height: 240 }),
  } as unknown as DrawingChartAdapter
}

/** 创建具有不同横坐标的两锚点命中测试适配器。 */
function createLineAdapter(): DrawingChartAdapter {
  return {
    getViewport: () => ({ scrollLeft: 0, plotWidth: 300, plotHeight: 240 }),
    getScreenXAtLogicalIndex: (index: number) => (index === 0 ? 20 : 220),
    getLogicalIndexAtTimestamp: (timestamp: number) => (timestamp === 1_000 ? 0 : 1),
    priceToY: (_paneId: string, price: number) => price,
    getPaneInfo: () => ({ paneId: 'main', top: 30, height: 240 }),
  } as unknown as DrawingChartAdapter
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

    expect(new HitTester().hitTest(137, 120, [drawing], createAdapter())).toEqual({ drawing })
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

    expect(
      new HitTester().findLabelTarget(120, 90, [drawing], createLineAdapter()),
    ).toMatchObject({
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
    expect(
      new HitTester().findLabelTarget(120, 94, [drawing], createLineAdapter()),
    ).toMatchObject({
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
