/** 绘图适配层直接使用公共坐标服务，并保持 Pane 局部坐标与单轴语义。 */
import { describe, expect, it } from 'vitest'
import { createMockRenderContext } from '@/engine/__tests__/helpers/renderTestKit.js'
import { getFrameCoordinates } from '@/engine/coordinates/impl/frameCoordinates.js'
import {
  CONTAINER,
  createDrawingAdapter,
  createPointerEvent,
} from '../../__tests__/helpers/drawingTestKit'
import { anchorToScreen, resolveDrawingPointer } from '../impl/coordinateUtils'

/** 分时副图使用封存中心点，正反向均取真实公共服务。 */
function createAdapter() {
  const coordinates = getFrameCoordinates(
    createMockRenderContext({
      data: [1000, 2000].map((timestamp) => ({
        timestamp,
        open: 1,
        high: 1,
        low: 1,
        close: 1,
      })),
      dataView: 'timeshare',
      kLineCenters: [137, 269],
      pane: {
        id: 'sub',
        top: 120,
        height: 80,
        yAxis: { priceToY: (p) => p + 10, yToPrice: (y) => y - 10 },
      },
    }),
  )
  return createDrawingAdapter({
    viewport: {
      getCoordinates: () => coordinates,
      getViewport: () => ({ scrollLeft: 0, plotWidth: 800, plotHeight: 240 }),
      getPaneInfo: () => ({ paneId: 'sub', top: 120, height: 80 }),
      getPaneAtY: (y) =>
        y >= 120 && y <= 200 ? { paneId: 'sub', top: 120, height: 80 } : undefined,
    },
  })
}

describe('绘图公共坐标适配', () => {
  it.each([
    ['point', { type: 'point', x: 137, y: 30 }],
    ['horizontal', { type: 'horizontal', y: 30 }],
    ['vertical', { type: 'vertical', x: 137 }],
  ] as const)('投影 %s 锚点时保持坐标轴语义', (type, expected) => {
    expect(anchorToScreen({ type, time: 1000, price: 20 }, 'sub', createAdapter())).toEqual(
      expected,
    )
  })

  it('指针坐标先定位副图，再通过同一公共接口反算时间和价格', () => {
    const adapter = createAdapter()
    expect(
      resolveDrawingPointer(createPointerEvent({ clientX: 137, clientY: 150 }), CONTAINER, adapter),
    ).toMatchObject({ time: 1000, price: 20, paneId: 'sub', x: 137, y: 30 })
    expect(
      resolveDrawingPointer(createPointerEvent({ clientX: 137, clientY: 300 }), CONTAINER, adapter),
    ).toBeNull()
    expect(
      resolveDrawingPointer(
        createPointerEvent({ clientX: 137, clientY: 300 }),
        CONTAINER,
        adapter,
        { clampPaneId: 'sub' },
      ),
    ).toMatchObject({ time: 1000, price: 70, x: 137, y: 80 })
  })

  it('未来时间吸附最近槽位，新落点保存该槽位时间', () => {
    const adapter = createAdapter()
    const coordinates = adapter.getCoordinates('sub')!
    const futureX = coordinates.logicalToX(3)!
    expect(anchorToScreen({ time: 3500, price: 20 }, 'sub', adapter)).toEqual({
      type: 'point',
      x: futureX,
      y: 30,
    })
    expect(
      resolveDrawingPointer(
        createPointerEvent({ clientX: futureX, clientY: 150 }),
        CONTAINER,
        adapter,
        {
          snapToSlot: true,
        },
      ),
    ).toMatchObject({ time: 4000, x: futureX, price: 20 })
  })
})
