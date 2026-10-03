/**
 * ChartZoomController 未来区（future time axis）回归测试。
 *
 * 覆盖：拖入未来区后缩放，锚点为指针所在槽位（无指针手势取视口左缘）；
 * 滚动量由 viewportState 的 maxScrollLeft 统一夹取，始终保留两个已有数据槽位。
 *
 * 数值基准：dpr=1，viewWidth=plotWidth=1000，dataLength=10，
 * 级别 6→5 缩小一级（kWidth 21→17.4，kGapPx 均钳 3，旧 unitPx=24 / 新 unitPx=20）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChartDataView } from '@/engine/state/modeState'
import { computed, createSignal } from '@/foundation/reactivity/signal'
import { createViewportStateDeps } from '../../state/__tests__/helpers/createViewportStateDeps'
import { createOptionsState } from '../../state/optionsState'
import { createViewportState } from '../../state/viewportState'
import { createZoomState } from '../../state/zoomState'
import { ChartZoomController } from '../chartZoomController'

/** 组装真实 viewportState / zoomState / optionsState 与控制器（无 DOM 依赖）。 */
function makeController(dpr = 1, period = 'daily', dataLength = 10, width = 1000) {
  const deps = createViewportStateDeps({ dataLength, period })
  const zoomState = createZoomState({
    minKWidth$: createSignal(3),
    maxKWidth$: createSignal(21),
    dataView$: deps.dataView$,
    zoomLevelCount: 6,
  })
  zoomState.actions.setZoomLevel(6)

  // 与真实 kernel 相同：viewport 直接订阅 zoomState 的 K 线宽度。
  const viewport = createViewportState({
    ...deps,
    options$: computed(() => ({
      bottomAxisHeight: 24,
      kWidth: zoomState.readonly.kWidth(),
    })),
    zoomLevel$: zoomState.readonly.zoomLevel,
    timeShareSlotWidth$: zoomState.readonly.timeShareSlotWidth,
  })
  viewport.actions.resize(width, 500, dpr)

  const options = createOptionsState({
    yPaddingPx: 20,
    rightAxisWidth: 0,
    leftAxisWidth: 0,
    bottomAxisHeight: 24,
    minKWidth: 3,
    maxKWidth: 21,
    priceLabelWidth: 60,
    panes: [],
    zoomLevelCount: 6,
    initialZoomLevel: 6,
  })

  const controller = new ChartZoomController(
    {
      viewport,
      options,
      onChange: () => {},
    },
    zoomState,
  )
  return { viewport, controller }
}

describe('ChartZoomController smooth zoom', () => {
  let time: number
  let frames: Map<number, FrameRequestCallback>
  let frameId: number
  beforeEach(() => {
    time = 0
    frameId = 0
    frames = new Map()
    vi.spyOn(performance, 'now').mockImplementation(() => time)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback)
      return frameId
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  const step = (dt: number) => {
    time += dt
    const callbacks = [...frames.values()]
    frames.clear()
    for (const callback of callbacks) callback(time)
  }

  it.each([1, 1.25, 1.5, 2, 3])('interpolates around the pointer slot at DPR=%s', (dpr) => {
    const { controller, viewport } = makeController(dpr)
    const before = viewport.readonly.viewSnapshot.peek()
    const pointer = before.grid.origin + before.grid.step * 4.37 - before.scroll
    controller.handleWheel(1, pointer)
    expect(controller.currentZoomLevel).toBe(6)
    step(40)
    expect(controller.currentZoomLevel).toBeGreaterThan(5)
    expect(controller.currentZoomLevel).toBeLessThan(6)
    for (const dt of [40, 40, 60]) {
      const view = viewport.readonly.viewSnapshot.peek()
      expect((view.scroll + pointer - view.grid.origin) / view.grid.step).toBeCloseTo(4.37, 10)
      step(dt)
    }
    expect(controller.currentZoomLevel).toBe(5)
    expect(frames.size).toBe(0)
  })

  it.each([400, 800, 1600])(
    'keeps the last several candles at the pointer throughout zoom, width=%s',
    (width) => {
      for (const dpr of [1, 1.5, 2]) {
        for (const distance of [2, 3, 10, 30, 60]) {
          for (const delta of [-1, 1]) {
            const { controller, viewport } = makeController(dpr, 'daily', 600, width)
            controller.zoomToLevel(delta < 0 ? 4 : 5)
            const slot = 600 - distance + 0.2
            const anchor = width * 0.75
            const initial = viewport.readonly.viewSnapshot.peek()
            viewport.actions.scrollToLogical(
              initial.grid.origin + slot * initial.grid.step - anchor,
            )
            controller.handleWheel(delta, anchor)
            for (let frame = 0; frame < 12; frame++) {
              step(16)
              const view = viewport.readonly.viewSnapshot.peek()
              expect((view.scroll + anchor - view.grid.origin) / view.grid.step).toBeCloseTo(
                slot,
                9,
              )
            }
            expect(frames.size).toBe(0)
          }
        }
      }
    },
  )

  it('accumulates wheel input and reverses smoothly from the current size', () => {
    const { controller } = makeController()
    controller.handleWheel(1, 100)
    step(40)
    const intermediate = controller.currentZoomLevel
    controller.handleWheel(1, 100)
    expect(controller.currentZoomLevel).toBe(intermediate)
    step(180)
    expect(controller.currentZoomLevel).toBe(4)
    controller.zoomIn(100)
    step(40)
    const growing = controller.currentZoomLevel
    controller.zoomOut(100)
    expect(controller.currentZoomLevel).toBe(growing)
    step(180)
    expect(controller.currentZoomLevel).toBe(4)
  })

  it.each(['min', 'max'] as const)('clamps every frame at the %s boundary', (side) => {
    const { controller, viewport } = makeController()
    controller.zoomToLevel(3)
    viewport.actions.scrollToLogical(side === 'min' ? -10000 : 10000)
    controller.handleWheel(-1, side === 'min' ? 0 : 1000)
    for (let i = 0; i < 12; i++) {
      step(16)
      const view = viewport.readonly.viewSnapshot.peek()
      expect(view.scroll).toBeGreaterThanOrEqual(view.scrollBounds.min)
      expect(view.scroll).toBeLessThanOrEqual(view.scrollBounds.max)
      expect(Math.min(view.range.end, 10) - Math.max(view.range.start, 0)).toBeGreaterThanOrEqual(2)
    }
    expect(controller.currentZoomLevel).toBe(4)
  })

  it('cancels pending zoom when dragging starts and accepts an immediate level jump', () => {
    const { controller } = makeController()
    controller.zoomOut()
    step(40)
    controller.stopAnimation()
    const stopped = controller.currentZoomLevel
    step(200)
    expect(controller.currentZoomLevel).toBe(stopped)
    expect(frames.size).toBe(0)
    controller.zoomIn()
    controller.zoomToLevel(2)
    step(200)
    expect(controller.currentZoomLevel).toBe(2)
    expect(frames.size).toBe(0)
  })

  it('keeps pinch changes continuous instead of rounding them to levels', () => {
    const { controller } = makeController()
    controller.zoomToLevel(3)
    controller.handlePinch(0.25, 100)
    expect(controller.currentZoomLevel).toBe(3.25)
  })
})

describe('ChartZoomController 有界槽位', () => {
  it.each([1, 1.25, 1.5, 2])('DPR=%s：放大时实际槽位间距同步增长', (dpr) => {
    const { viewport, controller } = makeController(dpr)
    let previousGapPx = 0
    let previousStepPx = 0
    for (const level of [1, 2, 3, 4, 5, 6]) {
      controller.zoomToLevel(level)
      const view = viewport.readonly.viewSnapshot.peek()
      const gapPx = view.kGap * dpr
      const stepPx = view.grid.step * dpr
      expect(gapPx).toBeGreaterThan(previousGapPx)
      expect(stepPx).toBeGreaterThan(previousStepPx)
      expect(stepPx).toBeCloseTo(view.kWidthPx + gapPx, 10)
      expect(view.worldAtIndex(1)! - view.worldAtIndex(0)!).toBeCloseTo(view.grid.step, 10)
      previousGapPx = gapPx
      previousStepPx = stepPx
    }
    expect(previousGapPx).toBeGreaterThan(3)
  })

  it.each([
    { side: 'min', requested: -10000, pointer: 0 },
    { side: 'max', requested: 10000, pointer: 1000 },
  ] as const)('放大超出 $side 边界时修正中心', ({ side, requested, pointer }) => {
    const { viewport, controller } = makeController()
    controller.zoomToLevel(3)
    viewport.actions.scrollToLogical(requested)
    const before = viewport.readonly.viewSnapshot.peek()
    const coordinate = (before.scroll + pointer - before.grid.origin) / before.grid.step
    controller.zoomToLevel(6, pointer)
    const after = viewport.readonly.viewSnapshot.peek()
    const anchored = after.grid.origin + coordinate * after.grid.step - pointer
    if (side === 'min') expect(anchored).toBeLessThan(after.scrollBounds.min)
    else expect(anchored).toBeGreaterThan(after.scrollBounds.max)
    expect(after.scroll).toBe(after.scrollBounds[side])
  })

  it('数据区域内缩放严格保持鼠标连续槽位', () => {
    const { viewport, controller } = makeController()
    const before = viewport.readonly.viewSnapshot.peek()
    const pointer = before.grid.origin + 4.37 * before.grid.step - before.scroll
    controller.zoomToLevel(5, pointer)
    const after = viewport.readonly.viewSnapshot.peek()
    expect((after.scroll + pointer - after.grid.origin) / after.grid.step).toBeCloseTo(4.37, 10)
  })

  it.each([-10000, -1000, -100, 0, 192, 10000])(
    '请求滚动量=%s：连续缩放优先保持鼠标槽位，仅在边界修正',
    (scroll) => {
      const { viewport, controller } = makeController()
      viewport.actions.scrollToLogical(scroll)
      const pointer = 501.37
      for (const level of [5, 4, 3, 2, 1, 2, 3, 4, 5, 6]) {
        const before = viewport.readonly.viewSnapshot.peek()
        const coordinate = (before.scroll + pointer - before.grid.origin) / before.grid.step
        controller.zoomToLevel(level, pointer)
        const view = viewport.readonly.viewSnapshot.peek()
        const next = view.grid
        const actual = viewport.readonly.scrollLeftLogical.peek()
        const anchored = next.origin + coordinate * next.step - pointer
        expect(actual).toBeCloseTo(
          Math.max(view.scrollBounds.min, Math.min(anchored, view.scrollBounds.max)),
          10,
        )
        if (anchored >= view.scrollBounds.min && anchored <= view.scrollBounds.max) {
          expect((actual + pointer - next.origin) / next.step).toBeCloseTo(coordinate, 10)
        }
        expect(viewport.readonly.viewport.peek().scrollLeft).toBe(actual)
        expect(viewport.readonly.scrollLeft.peek()).toBeGreaterThanOrEqual(0)
        expect(viewport.readonly.scrollLeft.peek()).toBeLessThanOrEqual(
          viewport.readonly.maxScrollLeft.peek(),
        )
      }
    },
  )

  it('零滚轮增量与缩放极限不移动视口', () => {
    const { viewport, controller } = makeController()
    const scroll = viewport.readonly.scrollLeftLogical.peek()
    controller.handleWheel(0, 100)
    controller.zoomIn(100)
    expect(viewport.readonly.scrollLeftLogical.peek()).toBe(scroll)
  })

  it.each([1, 1.25, 1.5, 2])('DPR=%s：分时也按实际绘制网格保持指针槽位', (dpr) => {
    const { viewport, controller } = makeController(dpr, 'timeshare')
    viewport.actions.scrollToLogical(-3000)
    const pointer = 237.31
    const initialGrid = viewport.readonly.slotGrid.peek()
    const coordinate =
      (viewport.readonly.scrollLeftLogical.peek() + pointer - initialGrid.origin) / initialGrid.step
    for (const level of [5, 4, 3, 2, 1, 2, 3, 4, 5, 6]) {
      controller.zoomToLevel(level, pointer)
      const grid = viewport.readonly.slotGrid.peek()
      expect(
        (viewport.readonly.scrollLeftLogical.peek() + pointer - grid.origin) / grid.step,
      ).toBeCloseTo(coordinate, 10)
    }
  })
})
