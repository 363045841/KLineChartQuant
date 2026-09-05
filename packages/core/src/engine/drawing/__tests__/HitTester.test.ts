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
})
