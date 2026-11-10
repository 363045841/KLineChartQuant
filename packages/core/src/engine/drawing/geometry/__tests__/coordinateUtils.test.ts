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
      data: [{ timestamp: 1000, open: 1, high: 1, low: 1, close: 1 }],
      dataView: 'timeshare',
      kLineCenters: [137],
      pane: {
        id: 'sub',
        top: 120,
        height: 80,
        yAxis: { priceToY: (p) => p + 10, yToPrice: (y) => y - 10 },
      },
      getTimestampAtLogicalIndex: (i) => [1000, 2000, 4000][i] ?? null,
    }),
  )
  return createDrawingAdapter({
    viewport: {
      getCoordinates: () => coordinates,
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

  it('未来时间映射到最近槽位，保持原始时间；新落点保存当前槽位时间', () => {
    const adapter = createAdapter()
    const coordinates = adapter.getCoordinates('sub')!
    const x = coordinates.logicalToX(1.5)!
    const anchor = { time: 3000, price: 20 }
    expect(anchorToScreen(anchor, 'sub', adapter)).toEqual({
      type: 'point',
      x: coordinates.logicalToX(2),
      y: 30,
    })
    expect(anchor.time).toBe(3000)
    expect(
      resolveDrawingPointer(createPointerEvent({ clientX: x, clientY: 150 }), CONTAINER, adapter, {
        snapToSlot: true,
      }),
    ).toMatchObject({ time: 4000, x: coordinates.logicalToX(2), price: 20 })
  })
})
