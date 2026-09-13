/** DragHandler 磁吸单测：锚点拖拽随指针吸附 OHLC，整线拖拽不受磁吸影响。 */
import { describe, expect, it } from 'vitest'

import type { DrawingChartAdapter } from '../../../controllers/types'
import type { DrawingObject } from '../../../foundation/plugin'
import { DragHandler } from '../DragHandler'

/** 价格↔Y 线性映射：y = 200 - price / price = 200 - y。 */
const priceToY = (_paneId: string, price: number) => 200 - price
const yToPrice = (_paneId: string, y: number) => 200 - y

/**
 * 三根 K 线数据：索引 1 为目标 Bar（open=100 high=120 low=80 close=110），
 * 屏幕 y：high=80 low=120 open=100 close=90；Bar i 占 [i*10, i*10+10)，中心 x=i*10+5。
 */
const OHLC_BARS = [
  { timestamp: 500, open: 50, high: 60, low: 40, close: 55 },
  { timestamp: 1000, open: 100, high: 120, low: 80, close: 110 },
  { timestamp: 1500, open: 200, high: 220, low: 180, close: 210 },
]
const BAR_TIMESTAMPS = [500, 1000, 1500]

/** 单锚点趋势线：锚点屏幕位置 (15, 90)（Bar 1 中心、价格 110）。 */
function createDrawing(): DrawingObject {
  return {
    id: 'd1',
    kind: 'trend-line',
    paneId: 'main',
    visible: true,
    anchors: [{ id: 'a0', type: 'point', time: 1000, price: 110 }],
  } as unknown as DrawingObject
}

/** 覆盖拖拽路径坐标换算的最小 adapter（与 interaction.magnet 测试同一坐标系约定）。 */
const adapter = {
  getDrawingData: () => OHLC_BARS,
  getData: () => OHLC_BARS,
  getViewport: () => ({ scrollLeft: 0, plotWidth: 100, plotHeight: 200 }),
  getPaneAtY: () => ({ paneId: 'main', top: 0, height: 200 }),
  getPaneInfo: () => ({ paneId: 'main', top: 0, height: 200 }),
  getLogicalIndexAtX: (x: number) => Math.floor(x / 10),
  getScreenXAtLogicalIndex: (index: number) => index * 10 + 5,
  getDrawingTimestampAtLogicalIndex: (index: number) => BAR_TIMESTAMPS[index] ?? null,
  getLogicalIndexAtTimestamp: (timestamp: number) => BAR_TIMESTAMPS.indexOf(timestamp),
  priceToY,
  yToPrice,
} as unknown as DrawingChartAdapter

const CONTAINER = {
  getBoundingClientRect: () => ({ left: 0, top: 0 }),
} as HTMLElement

/** 构造指针移动事件。 */
function pointerMove(
  x: number,
  y: number,
  modifiers: { ctrlKey?: boolean; shiftKey?: boolean } = {},
): PointerEvent {
  return {
    clientX: x,
    clientY: y,
    ctrlKey: modifiers.ctrlKey ?? false,
    shiftKey: modifiers.shiftKey ?? false,
    metaKey: false,
  } as PointerEvent
}

describe('DragHandler magnet', () => {
  it('锚点拖拽：strong 磁吸把被拖锚点收敛到 OHLC 与 Bar 中心', () => {
    const handler = new DragHandler()
    handler.startDrag([createDrawing()], 0, 15, 90)

    // 指针 (12, 83)：距 high(y=80) 3px，strong 半径内 → 价格收敛 120；X 吸 Bar 中心 15（时间 1000）。
    const updated = handler.handleDragMove(pointerMove(12, 83), CONTAINER, adapter, {
      magnet: { mode: 'strong' },
    })
    expect(updated).toHaveLength(1)
    expect(updated![0]!.anchors[0]).toMatchObject({ time: 1000, price: 120 })
  })

  it('锚点拖拽：不传磁吸时锚点保持原始指针落点', () => {
    const handler = new DragHandler()
    handler.startDrag([createDrawing()], 0, 15, 90)

    const updated = handler.handleDragMove(pointerMove(12, 83), CONTAINER, adapter)
    expect(updated![0]!.anchors[0]).toMatchObject({ time: 1000, price: 117 })
  })

  it('整线拖拽不受磁吸影响（位移增量语义）', () => {
    const handler = new DragHandler()
    handler.startDrag([createDrawing()], undefined, 15, 90)

    // 指针 (12, 83) 若被磁吸改写为 (15, 80)，锚点会收敛到价格 120；
    // 增量语义下应随位移 (-3, -7) 到 (12, 83)，价格 117。
    const updated = handler.handleDragMove(pointerMove(12, 83), CONTAINER, adapter, {
      magnet: { mode: 'strong' },
    })
    expect(updated![0]!.anchors[0]).toMatchObject({ time: 1000, price: 117 })
  })
})
