/** 验证绘图交互坐标使用当前帧中心点并保留 Pane 局部坐标。 */
import { describe, expect, it } from 'vitest'

import type { DrawingChartAdapter } from '../../../controllers/types'
import { anchorToScreen, resolveDrawingPointer } from '../coordinateUtils'

/** 创建覆盖副图与分时坐标路径的最小 adapter。 */
function createAdapter(): DrawingChartAdapter {
  return {
    getViewport: () => ({ scrollLeft: 0, plotWidth: 300, plotHeight: 240 }),
    getKWidthKGap: () => ({ kWidth: 8, kGap: 2 }),
    getDrawingData: () => [{ timestamp: 1_000 }],
    getLogicalIndexAtX: () => 0,
    getScreenXAtLogicalIndex: () => 137,
    getDrawingTimestampAtLogicalIndex: () => 1_000,
    getLogicalIndexAtTimestamp: () => 0,
    getDrawingWorkspaceId: () => 'timeshare',
    priceToY: (paneId, price) => (paneId === 'sub' ? price + 10 : price),
    yToPrice: (_paneId, y) => y + 100,
    getPaneInfo: (paneId) => (paneId === 'sub' ? { paneId, top: 120, height: 80 } : undefined),
    getPaneAtY: (y) => (y >= 120 && y <= 200 ? { paneId: 'sub', top: 120, height: 80 } : undefined),
  } as unknown as DrawingChartAdapter
}

describe('drawing coordinate utilities', () => {
  it('uses sealed frame centers instead of K-line spacing for a time-share anchor', () => {
    const point = anchorToScreen({ id: 'anchor', time: 1_000, price: 20 }, 'sub', createAdapter())

    expect(point).toEqual({ x: 137, y: 30 })
  })

  it('resolves the pointer to the hit sub-pane and local Y coordinate', () => {
    const pointer = resolveDrawingPointer(
      { clientX: 80, clientY: 150 } as PointerEvent,
      { getBoundingClientRect: () => ({ left: 0, top: 0 }) } as HTMLElement,
      createAdapter(),
    )

    expect(pointer).toMatchObject({
      time: 1_000,
      price: 130,
      paneId: 'sub',
      x: 80,
      y: 30,
    })
  })
})
