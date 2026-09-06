/** 验证单轴锚点图元的命中检测。 */
import { describe, expect, it } from 'vitest'

import type { DrawingChartAdapter } from '../../../controllers/types'
import type { DrawingObject } from '../../../foundation/plugin'
import { HitTester } from '../HitTester'

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

  it('returns the independent Fibonacci line label target at a line center', () => {
    const drawing: DrawingObject = {
      id: 'fib',
      kind: 'fib-retracement',
      paneId: 'main',
      visible: true,
      anchors: [
        { id: 'a', type: 'point', time: 1_000, price: 40 },
        { id: 'b', type: 'point', time: 2_000, price: 140 },
      ],
      params: { lineLabels: { 3: '50% text' } },
      style: {},
    }

    expect(new HitTester().findLineLabelTarget(120, 90, [drawing], createLineAdapter())).toEqual({
      drawingId: 'fib',
      targetKind: 'line',
      lineIndex: 3,
      x: 120,
      y: 120,
      rotation: 0,
      text: '50% text',
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

    expect(
      new HitTester().findLineLabelTarget(120, 90, [drawing], createLineAdapter()),
    ).toMatchObject({
      drawingId: 'ray',
      lineIndex: 0,
      x: 120,
      y: 120,
    })
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
      params: { areaLabels: { 0: '区域文本' } },
      style: {},
    }

    expect(
      new HitTester().findAreaLabelTarget(120, 90, [drawing], createLineAdapter()),
    ).toMatchObject({
      drawingId: 'rectangle',
      targetKind: 'area',
      lineIndex: 0,
      x: 120,
      y: 120,
      text: '区域文本',
    })
  })
})
