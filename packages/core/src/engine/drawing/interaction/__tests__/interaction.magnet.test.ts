/** 交互层磁吸集成测试：验证绘图模式锚点收敛、Ctrl 临时强吸与 cursor 路径不受影响。 */
import { describe, expect, it } from 'vitest'

import {
  CONTAINER,
  createAnchorDragDrawing,
  createMagnetController,
  pointerDown,
} from '../../__tests__/helpers/drawingTestKit'

describe('DrawingInteractionController magnet', () => {
  it('weak 档下单锚点工具的落点价格收敛到最近的 high/low', () => {
    const { controller, createDrawing } = createMagnetController('weak')

    // 点击 (12, 83)：距 high(y=80) 3px，在 weak 半径内 → 锚点价格收敛 120。
    expect(controller.onPointerDown(pointerDown(12, 83), CONTAINER)).toBe(true)
    expect(createDrawing).toHaveBeenCalledTimes(1)
    expect(createDrawing.mock.calls[0]![0].anchors[0]).toMatchObject({
      timestamp: 1000,
      price: 120,
    })
  })

  it('weak 档下距 high/low 超半径的落点保持原始价格', () => {
    const { controller, createDrawing } = createMagnetController('weak')

    // 点击 (12, 101)：距 high 21px、距 low 19px，均超 8px 半径 → 价格保持 99。
    expect(controller.onPointerDown(pointerDown(12, 101), CONTAINER)).toBe(true)
    expect(createDrawing.mock.calls[0]![0].anchors[0]).toMatchObject({ price: 99 })
  })

  it('strong 档吸附 open（weak 候选之外的值）', () => {
    const { controller, createDrawing } = createMagnetController('strong')

    // 点击 (12, 101)：距 open(y=100) 1px → 价格收敛 100。
    expect(controller.onPointerDown(pointerDown(12, 101), CONTAINER)).toBe(true)
    expect(createDrawing.mock.calls[0]![0].anchors[0]).toMatchObject({ price: 100 })
  })

  it('strong 档远离 OHLC 时仍收敛到最近价格', () => {
    const { controller, createDrawing } = createMagnetController('strong')

    // y=150 距最近的 low(y=120) 30px，仍吸附到 low(price=80)。
    expect(controller.onPointerDown(pointerDown(12, 150), CONTAINER)).toBe(true)
    expect(createDrawing.mock.calls[0]![0].anchors[0]).toMatchObject({ price: 80 })
  })

  it('Ctrl 取反：off 档临时开启为 strong 吸附（TV 语义）', () => {
    const { controller, createDrawing } = createMagnetController('off')

    // off 档 + Ctrl：距 open 1px，临时开启 strong → 收敛 100。
    expect(controller.onPointerDown(pointerDown(12, 101, { ctrlKey: true }), CONTAINER)).toBe(true)
    expect(createDrawing.mock.calls[0]![0].anchors[0]).toMatchObject({ price: 100 })
  })

  it('Ctrl 取反：weak 档临时关闭不吸附', () => {
    const { controller, createDrawing } = createMagnetController('weak')

    // weak 档 + Ctrl：距 high 3px 本应吸附，取反为关闭 → 价格保持 117。
    expect(controller.onPointerDown(pointerDown(12, 83, { ctrlKey: true }), CONTAINER)).toBe(true)
    expect(createDrawing.mock.calls[0]![0].anchors[0]).toMatchObject({ price: 117 })
  })

  it('Ctrl 取反：strong 档临时关闭不吸附', () => {
    const { controller, createDrawing } = createMagnetController('strong')

    // strong 档 + Ctrl：距 open 1px 本应吸附，取反为关闭 → 价格保持 99。
    expect(controller.onPointerDown(pointerDown(12, 101, { ctrlKey: true }), CONTAINER)).toBe(true)
    expect(createDrawing.mock.calls[0]![0].anchors[0]).toMatchObject({ price: 99 })
  })

  it('Shift 按住时不吸附（与宿主锁角互斥）', () => {
    const { controller, createDrawing } = createMagnetController('strong')

    // strong 档 + Shift：距 open 1px 但不吸附 → 价格保持 99（锁角优先于磁吸）。
    expect(controller.onPointerDown(pointerDown(12, 101, { shiftKey: true }), CONTAINER)).toBe(true)
    expect(createDrawing.mock.calls[0]![0].anchors[0]).toMatchObject({ price: 99 })

    // Ctrl + Shift 同按：Shift 优先，Ctrl 取反同样被抑制。
    createDrawing.mockClear()
    expect(
      controller.onPointerDown(pointerDown(12, 101, { ctrlKey: true, shiftKey: true }), CONTAINER),
    ).toBe(true)
    expect(createDrawing.mock.calls[0]![0].anchors[0]).toMatchObject({ price: 99 })
  })

  it('off 档且无修饰键时不吸附', () => {
    const { controller, createDrawing } = createMagnetController('off')

    expect(controller.onPointerDown(pointerDown(12, 83), CONTAINER)).toBe(true)
    expect(createDrawing.mock.calls[0]![0].anchors[0]).toMatchObject({ price: 117 })
  })

  it('磁吸后的 X 吸附到 Bar 中心（同一 Bar 内点击解析出同一时间戳）', () => {
    const { controller, createDrawing } = createMagnetController('weak')

    // 点击 (12, 83)：吸附后 x=15（Bar 1 中心），仍解析回 Bar 1 的时间戳 1000。
    expect(controller.onPointerDown(pointerDown(12, 83), CONTAINER)).toBe(true)
    expect(createDrawing.mock.calls[0]![0].anchors[0]).toMatchObject({
      timestamp: 1000,
      price: 120,
    })
  })

  it('cursor 模式的命中路径不受磁吸影响', () => {
    const { controller, adapter } = createMagnetController('strong', 'cursor')

    // cursor 模式点击空白处：resolveDrawingPointer 不传磁吸，落点解析与磁吸档位无关。
    expect(controller.onPointerDown(pointerDown(12, 101), CONTAINER)).toBe(false)
    expect(adapter.setSelectedDrawingIds).toHaveBeenLastCalledWith([])
  })

  it('编辑路径：锚点拖拽随磁吸收敛（修饰键与绘制路径同源）', () => {
    const { controller, commitDrawingDrag } = createMagnetController('strong', 'cursor', [
      createAnchorDragDrawing(),
    ])

    // 按下锚点 (15, 88)：距锚点屏幕位置 (15, 90) 2px，命中锚点并开拖。
    expect(controller.onPointerDown(pointerDown(15, 88), CONTAINER)).toBe(true)
    // 移动到 (12, 83)：strong 磁吸 → 锚点收敛到 high（价格 120，时间 1000）。
    expect(controller.onPointerMove(pointerDown(12, 83), CONTAINER)).toBe(true)
    controller.onPointerUp(pointerDown(12, 83), CONTAINER)
    expect(commitDrawingDrag).toHaveBeenCalledWith('d1', [
      expect.objectContaining({ time: 1000, price: 120 }),
    ])
  })

  it('编辑路径：Shift 按住时锚点拖拽不吸附（互斥与绘制路径同源）', () => {
    const { controller, commitDrawingDrag } = createMagnetController('strong', 'cursor', [
      createAnchorDragDrawing(),
    ])

    controller.onPointerDown(pointerDown(15, 88), CONTAINER)
    // Shift 按住拖动：互斥不吸附 → 锚点保持指针原始落点（价格 117）。
    controller.onPointerMove(pointerDown(12, 83, { shiftKey: true }), CONTAINER)
    controller.onPointerUp(pointerDown(12, 83), CONTAINER)
    expect(commitDrawingDrag).toHaveBeenCalledWith('d1', [
      expect.objectContaining({ time: 1000, price: 117 }),
    ])
  })
})
