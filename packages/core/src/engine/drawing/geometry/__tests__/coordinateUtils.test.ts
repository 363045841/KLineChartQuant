/** 验证绘图交互坐标使用当前帧中心点并保留 Pane 局部坐标。 */
import { describe, expect, it } from 'vitest'

import type { DrawingViewportPort } from '@/controllers/types'
import {
  CONTAINER,
  createDrawingAdapter,
  createPointerEvent,
} from '../../__tests__/helpers/drawingTestKit'
import { anchorToScreen, resolveDrawingPointer, screenToAnchor } from '../impl/coordinateUtils'

/** 创建覆盖副图与分时坐标路径的最小 adapter。 */
function createAdapter(overrides: Partial<DrawingViewportPort> = {}) {
  return createDrawingAdapter({
    viewport: {
      getViewport: () => ({ scrollLeft: 0, plotWidth: 300, plotHeight: 240 }),
      getDrawingData: () => [{ timestamp: 1_000 }],
      getLogicalIndexAtX: () => 0,
      getScreenXAtLogicalIndex: () => 137,
      getDrawingTimestampAtLogicalIndex: () => 1_000,
      getLogicalIndexAtTimestamp: () => 0,
      getDrawingWorkspaceId: () => 'timeshare',
      priceToY: (paneId, price) => (paneId === 'sub' ? price + 10 : price),
      yToPrice: (_paneId, y) => y + 100,
      getPaneInfo: (paneId) => (paneId === 'sub' ? { paneId, top: 120, height: 80 } : undefined),
      getPaneAtY: (y) =>
        y >= 120 && y <= 200 ? { paneId: 'sub', top: 120, height: 80 } : undefined,
      ...overrides,
    },
  })
}

describe('drawing coordinate utilities', () => {
  it('uses sealed frame centers instead of K-line spacing for a time-share anchor', () => {
    const point = anchorToScreen({ id: 'anchor', time: 1_000, price: 20 }, 'sub', createAdapter())

    expect(point).toEqual({ type: 'point', x: 137, y: 30 })
  })

  it('projects a horizontal anchor to Y only', () => {
    const anchor = anchorToScreen(
      { id: 'anchor', type: 'horizontal', price: 20 },
      'sub',
      createAdapter(),
    )

    expect(anchor).toEqual({ type: 'horizontal', y: 30 })
  })

  it('resolves the pointer to the hit sub-pane and local Y coordinate', () => {
    const pointer = resolveDrawingPointer(
      createPointerEvent({ clientX: 80, clientY: 150 }),
      CONTAINER,
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

  it('returns null when the pointer leaves the drawing area without a clamp target', () => {
    expect(
      resolveDrawingPointer(
        createPointerEvent({ clientX: 80, clientY: 300 }),
        CONTAINER,
        createAdapter(),
      ),
    ).toBeNull()
  })

  it('clamps an out-of-bounds pointer to the target pane edge', () => {
    expect(
      resolveDrawingPointer(
        createPointerEvent({ clientX: 80, clientY: 300 }),
        CONTAINER,
        createAdapter(),
        { clampPaneId: 'sub' },
      ),
    ).toMatchObject({ time: 1_000, price: 180, paneId: 'sub', x: 80, y: 80 })
  })

  it('clamps the horizontal coordinate to the plot width', () => {
    expect(
      resolveDrawingPointer(
        createPointerEvent({ clientX: 500, clientY: 150 }),
        CONTAINER,
        createAdapter(),
        { clampPaneId: 'sub' },
      ),
    ).toMatchObject({ x: 300, y: 30 })
  })

  it('stores a right-side blank-area anchor as an offset from the last bar', () => {
    const adapter = createAdapter({
      getLogicalIndexAtX: () => 3,
      getScreenXAtLogicalIndex: (index) => 137 + index * 10,
    })

    expect(screenToAnchor(170, 30, 'sub', adapter)).toEqual({
      time: 1_000,
      futureOffset: 3,
      price: 130,
    })
    expect(
      anchorToScreen(
        { id: 'future-anchor', time: 1_000, futureOffset: 3, price: 20 },
        'sub',
        adapter,
      ),
    ).toEqual({ type: 'point', x: 167, y: 30 })
  })
})
