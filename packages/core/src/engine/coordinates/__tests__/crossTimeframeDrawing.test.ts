/** 同一正式文档跨日线、小时线和分钟线绘制、命中和编辑，创建落点必须吸附槽位。 */
import { describe, expect, it } from 'vitest'
import { createMockRenderContext } from '@/engine/__tests__/helpers/renderTestKit.js'
import { createDrawingDocumentFixture } from '@/engine/drawing/__tests__/helpers/drawingDocumentFixture.js'
import {
  CONTAINER,
  createDrawingViewportPort,
  createPointerEvent,
} from '@/engine/drawing/__tests__/helpers/drawingTestKit.js'
import { resolveDrawingPointer } from '@/engine/drawing/geometry/impl/coordinateUtils.js'
import { projectDrawingsForFrame } from '@/engine/drawing/geometry/impl/frameProjection.js'
import { DragHandler } from '@/engine/drawing/interaction/impl/DragHandler.js'
import { HitTester } from '@/engine/drawing/interaction/impl/HitTester.js'
import { DrawingDefinitionRegistry } from '@/engine/drawing/render/impl/DrawingDefinitionRegistry.js'
import { DrawingStore } from '@/engine/drawing/render/impl/DrawingStore.js'
import { registerDefaultDrawingDefinitions } from '@/engine/drawing/render/impl/definitions/index.js'
import { getFrameCoordinates } from '../impl/frameCoordinates.js'

const START = Date.UTC(2026, 0, 5)
const DAY = 86400000

/** 连续交易市场的真实帧结构；仅改变周期和行情点列，不修改绘图文档。 */
function frame(minutes: number, symbolKey = 'asset-a') {
  const count = Math.ceil((3 * 1440) / minutes)
  const data = Array.from({ length: count }, (_, i) => ({
    timestamp: START + i * minutes * 60000,
    open: 10,
    high: 25,
    low: 5,
    close: 20,
  }))
  const context = createMockRenderContext({
    symbolKey,
    data,
    period: minutes === 1440 ? 'daily' : `${minutes}min`,
    kWidth: 18,
    kGap: 2,
    kLineCenters: data.map((_, i) => 10 + i * 20),
    paneWidth: count * 20,
    viewport: { scrollLeft: 0, plotWidth: count * 20, plotHeight: 200 },
    pane: { height: 200, yAxis: { priceToY: (p) => 200 - p, yToPrice: (y) => 200 - y } },
  })
  const coordinates = getFrameCoordinates(context)
  const adapter = createDrawingViewportPort({
    getCoordinates: () => coordinates,
    getData: () => data,
    getDrawingData: () => data,
    getViewport: () => context.viewport,
    getPaneInfo: () => ({ paneId: 'main', top: 0, height: 200 }),
  })
  return { context, coordinates, adapter }
}

describe('一份绘图跨周期显示', () => {
  it.each([
    [0, DAY],
    [10 * 3600000 + 15 * 60000, DAY],
    [10 * 3600000 + 15 * 60000, 5 * 60000],
  ])('原始时间偏移 %s、跨度 %s 在日线、小时线和分钟线往返后保持文档不变', (offset, span) => {
    const { state, document } = createDrawingDocumentFixture(() => 'asset-a')
    const drawing = document.createDrawing({
      kind: 'trend-line',
      paneId: 'main',
      style: { stroke: '#2962ff' },
      anchors: [
        { timestamp: START + offset, price: 10 },
        { timestamp: START + span + offset, price: 20 },
      ],
    })
    const original = state.readonly.drawings.peek()
    const store = new DrawingStore({
      drawings$: state.readonly.drawings,
      selectedDrawingIds$: state.readonly.selectedDrawingIds,
    })
    const definitions = new DrawingDefinitionRegistry()
    registerDefaultDrawingDefinitions(definitions)
    for (const minutes of [1440, 60, 5, 1440]) {
      const { context, coordinates, adapter } = frame(minutes)
      const projection = projectDrawingsForFrame(store, definitions, context)
      const line = projection.primitives.find((primitive) => primitive.kind === 'line')
      expect(line).toBeDefined()
      if (!line || line.kind !== 'line') throw new Error('趋势线投影缺失')
      const first = drawing.anchors[0]!
      const index = coordinates.timeToSlot(Number(first.time))!
      expect(Number.isInteger(index)).toBe(true)
      expect(line.a.x).toBe(coordinates.logicalToX(index))
      expect(new HitTester().hitTest(line.a.x, line.a.y, [drawing], adapter)?.drawing.id).toBe(
        drawing.id,
      )
      expect(state.readonly.drawings.peek()).toBe(original)
    }
    expect(
      projectDrawingsForFrame(store, definitions, frame(60, 'asset-b').context).primitives,
    ).toEqual([])
  })

  it.each([1440, 60, 5])('在 %s 分钟周期创建时先吸附 K 线槽位，再保存该槽位时间', (minutes) => {
    const { adapter } = frame(minutes)
    const pointer = resolveDrawingPointer(
      createPointerEvent({ clientX: 24, clientY: 180 }),
      CONTAINER,
      adapter,
      { snapToSlot: true },
    )
    expect(pointer).toMatchObject({ time: START + minutes * 60000, x: 30, price: 20 })
  })

  it('在大周期只上下平移时，原先处于槽位内部的时间不会因像素反算改变', () => {
    const { document } = createDrawingDocumentFixture(() => 'asset-a')
    const drawing = document.createDrawing({
      kind: 'trend-line',
      paneId: 'main',
      style: { stroke: '#2962ff' },
      anchors: [
        { timestamp: START + 15 * 60000, price: 10 },
        { timestamp: START + DAY + 15 * 60000, price: 20 },
      ],
    })
    const { adapter, coordinates } = frame(1440)
    const x = coordinates.logicalToX(coordinates.timeToSlot(Number(drawing.anchors[0]!.time))!)!
    const drag = new DragHandler()
    drag.startDrag([drawing], { type: 'all' }, x, 190)
    const updated = drag.handleDragMove(
      createPointerEvent({ clientX: x, clientY: 180 }),
      CONTAINER,
      adapter,
    )?.[0]
    expect(updated?.anchors.map((anchor) => anchor.time)).toEqual(
      drawing.anchors.map((anchor) => anchor.time),
    )
    document.commitDrawingDrag(drawing.id, updated!.anchors)
    expect(document.getDrawing(drawing.id)?.anchors[0]?.price).toBe(20)
  })

  it('切换标的只改变文档视图，清除当前标的保留其他标的图元', () => {
    let symbol = 'asset-a'
    const { state, document } = createDrawingDocumentFixture(() => symbol)
    const create = () =>
      document.createDrawing({
        kind: 'horizontal-line',
        paneId: 'main',
        anchors: [{ price: 10 }],
        style: { stroke: '#2962ff' },
      })
    const first = create()
    symbol = 'asset-b'
    const second = create()
    expect(state.readonly.drawings.peek()).toHaveLength(2)
    expect(document.listCurrentDrawings().map((drawing) => drawing.id)).toEqual([second.id])
    expect(document.removeDrawing(first.id)).toBe(false)
    document.clearDrawings()
    symbol = 'asset-a'
    expect(document.listCurrentDrawings().map((drawing) => drawing.id)).toEqual([first.id])
    expect(state.readonly.drawings.peek()).toHaveLength(1)
  })
})
