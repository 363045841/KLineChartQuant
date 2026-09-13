/** 交互层磁吸集成测试：验证绘图模式锚点收敛、Ctrl 临时强吸与 cursor 路径不受影响。 */
import { describe, expect, it, vi } from 'vitest'

import type { DrawingChartAdapter } from '../../../controllers/types'
import type { DrawingObject } from '../../../foundation/plugin'
import { DrawingInteractionController } from '../interaction'

/** 价格↔Y 线性映射：y = 200 - price / price = 200 - y。 */
const priceToY = (_paneId: string, price: number) => 200 - price
const yToPrice = (_paneId: string, y: number) => 200 - y

/**
 * 三根 K 线数据：索引 1 为目标 Bar（open=100 high=120 low=80 close=110），
 * 屏幕 y：high=80 low=120 open=100 close=90。
 */
const OHLC_BARS = [
  { timestamp: 500, open: 50, high: 60, low: 40, close: 55 },
  { timestamp: 1000, open: 100, high: 120, low: 80, close: 110 },
  { timestamp: 1500, open: 200, high: 220, low: 180, close: 210 },
]
const BAR_TIMESTAMPS = [500, 1000, 1500]

/**
 * 构造覆盖磁吸路径的最小 adapter。
 * 坐标约定：Bar i 占 [i*10, i*10+10)，中心在 x=i*10+5；getLogicalIndexAtX = floor(x/10)。
 */
function createAdapter(tool: 'h-ray' | 'cursor') {
  const createDrawing = vi.fn(
    (input: { anchors: Array<{ price: number }> }) =>
      ({ id: 'created', anchors: input.anchors }) as unknown as DrawingObject,
  )
  const adapter = {
    getDrawingToolId: () => tool,
    getFullDrawings: () => [] as DrawingObject[],
    getSelectedDrawingIds: () => [] as string[],
    setSelectedDrawingIds: vi.fn(),
    createDrawing,
    setDrawingToolId: vi.fn(),
    getDrawingData: () => OHLC_BARS,
    getData: () => OHLC_BARS,
    getViewport: () => ({ scrollLeft: 0, plotWidth: 100, plotHeight: 200 }),
    getPaneAtY: () => ({ paneId: 'main', top: 0, height: 200 }),
    getPaneInfo: () => ({ paneId: 'main', top: 0, height: 200 }),
    getLogicalIndexAtX: (x: number) => Math.floor(x / 10),
    getScreenXAtLogicalIndex: (index: number) => index * 10 + 5,
    getDrawingTimestampAtLogicalIndex: (index: number) => BAR_TIMESTAMPS[index] ?? null,
    getDrawingWorkspaceId: () => 'kline' as const,
    priceToY,
    yToPrice,
  } as unknown as DrawingChartAdapter
  return { adapter, createDrawing }
}

/** 构造指定坐标与修饰键的指针按下事件。 */
function pointerDown(
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

const CONTAINER = {
  getBoundingClientRect: () => ({ left: 0, top: 0 }),
} as HTMLElement

describe('DrawingInteractionController magnet', () => {
  it('weak 档下单锚点工具的落点价格收敛到最近的 high/low', () => {
    const { adapter, createDrawing } = createAdapter('h-ray')
    const controller = new DrawingInteractionController(adapter)
    controller.setMagnetMode('weak')

    // 点击 (12, 83)：距 high(y=80) 3px，在 weak 半径内 → 锚点价格收敛 120。
    expect(controller.onPointerDown(pointerDown(12, 83), CONTAINER)).toBe(true)
    expect(createDrawing).toHaveBeenCalledTimes(1)
    expect(createDrawing.mock.calls[0]![0].anchors[0]).toMatchObject({
      timestamp: 1000,
      price: 120,
    })
  })

  it('weak 档下距 high/low 超半径的落点保持原始价格', () => {
    const { adapter, createDrawing } = createAdapter('h-ray')
    const controller = new DrawingInteractionController(adapter)
    controller.setMagnetMode('weak')

    // 点击 (12, 101)：距 high 21px、距 low 19px，均超 8px 半径 → 价格保持 99。
    expect(controller.onPointerDown(pointerDown(12, 101), CONTAINER)).toBe(true)
    expect(createDrawing.mock.calls[0]![0].anchors[0]).toMatchObject({ price: 99 })
  })

  it('strong 档吸附 open（weak 候选之外的值）', () => {
    const { adapter, createDrawing } = createAdapter('h-ray')
    const controller = new DrawingInteractionController(adapter)
    controller.setMagnetMode('strong')

    // 点击 (12, 101)：距 open(y=100) 1px → 价格收敛 100。
    expect(controller.onPointerDown(pointerDown(12, 101), CONTAINER)).toBe(true)
    expect(createDrawing.mock.calls[0]![0].anchors[0]).toMatchObject({ price: 100 })
  })

  it('Ctrl 按住时临时升级为 strong（含 off 档）', () => {
    const { adapter, createDrawing } = createAdapter('h-ray')
    const controller = new DrawingInteractionController(adapter)
    controller.setMagnetMode('off')

    // off 档 + Ctrl：距 open 1px，strong 半径内 → 收敛 100（与壳侧基准一致，Ctrl 覆盖 off）。
    expect(controller.onPointerDown(pointerDown(12, 101, { ctrlKey: true }), CONTAINER)).toBe(true)
    expect(createDrawing.mock.calls[0]![0].anchors[0]).toMatchObject({ price: 100 })
  })

  it('Shift 按住时不吸附（与宿主锁角互斥）', () => {
    const { adapter, createDrawing } = createAdapter('h-ray')
    const controller = new DrawingInteractionController(adapter)
    controller.setMagnetMode('strong')

    // strong 档 + Shift：距 open 1px 但不吸附 → 价格保持 99（锁角优先于磁吸）。
    expect(controller.onPointerDown(pointerDown(12, 101, { shiftKey: true }), CONTAINER)).toBe(true)
    expect(createDrawing.mock.calls[0]![0].anchors[0]).toMatchObject({ price: 99 })

    // Ctrl + Shift 同按：Shift 优先，Ctrl 升级被抑制。
    createDrawing.mockClear()
    expect(
      controller.onPointerDown(pointerDown(12, 101, { ctrlKey: true, shiftKey: true }), CONTAINER),
    ).toBe(true)
    expect(createDrawing.mock.calls[0]![0].anchors[0]).toMatchObject({ price: 99 })
  })

  it('off 档且无修饰键时不吸附', () => {
    const { adapter, createDrawing } = createAdapter('h-ray')
    const controller = new DrawingInteractionController(adapter)
    controller.setMagnetMode('off')

    expect(controller.onPointerDown(pointerDown(12, 83), CONTAINER)).toBe(true)
    expect(createDrawing.mock.calls[0]![0].anchors[0]).toMatchObject({ price: 117 })
  })

  it('磁吸后的 X 吸附到 Bar 中心（同一 Bar 内点击解析出同一时间戳）', () => {
    const { adapter, createDrawing } = createAdapter('h-ray')
    const controller = new DrawingInteractionController(adapter)
    controller.setMagnetMode('weak')

    // 点击 (12, 83)：吸附后 x=15（Bar 1 中心），仍解析回 Bar 1 的时间戳 1000。
    expect(controller.onPointerDown(pointerDown(12, 83), CONTAINER)).toBe(true)
    expect(createDrawing.mock.calls[0]![0].anchors[0]).toMatchObject({
      timestamp: 1000,
      price: 120,
    })
  })

  it('cursor 模式的命中路径不受磁吸影响', () => {
    const { adapter } = createAdapter('cursor')
    const controller = new DrawingInteractionController(adapter)
    controller.setMagnetMode('strong')

    // cursor 模式点击空白处：resolveDrawingPointer 不传磁吸，落点解析与磁吸档位无关。
    const pointer = pointerDown(12, 101)
    expect(controller.onPointerDown(pointer, CONTAINER)).toBe(false)
    expect(adapter.setSelectedDrawingIds).toHaveBeenLastCalledWith([])
  })
})
