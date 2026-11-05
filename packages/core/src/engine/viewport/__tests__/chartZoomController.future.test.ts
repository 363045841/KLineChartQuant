/**
 * ChartZoomController 未来区（future time axis）回归测试。
 *
 * 覆盖：拖入未来区后缩放，锚点为指针所在槽位（无指针手势取视口左缘）；
 * 滚动量由 viewportState 的 maxScrollLeft 统一夹取，始终保留两个已有数据槽位。
 *
 * 数值基准：dpr=1，viewWidth=plotWidth=1000，dataLength=10，
 * 级别 6→5 缩小一级（kWidth 21→17.4，kGapRatio=0.6）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChartDataView } from '@/engine/chartModel/index'
import { KLINE_GAP_RATIOS } from '@/foundation/config/chartSettings'
import { computed, createSignal } from '@/foundation/reactivity/signal'
import type { ScaleXSnapshot } from '../../scale/index'
import { createViewportStateDeps } from '../../state/__tests__/helpers/createViewportStateDeps'
import { createOptionsState } from '../../state/optionsState'
import { createViewportState } from '../../state/viewportState'
import { createZoomState } from '../../state/zoomState'
import { ChartZoomController } from '../chartZoomController'

/** 理想锚点到已提交导航的误差最多半个物理像素，且不随动画帧累积。 */
function expectPixelAnchor(view: ScaleXSnapshot, slot: number, anchor: number, dpr: number): void {
  const error = view.grid.origin + slot * view.grid.step - view.scroll - anchor
  expect(Math.abs(error) * dpr).toBeLessThanOrEqual(0.5 + 1e-8)
}

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
    geometry$: computed(() => ({
      bottomAxisHeight: 24,
      kWidth: zoomState.readonly.kWidth(),
      kGapRatio: KLINE_GAP_RATIOS.standard,
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
  return { viewport, controller, zoomState }
}

/** 覆盖视口宽度、DPR、距右缘槽数与缩放方向的全部锚点组合。 */
const pointerAnchorCases = [400, 800, 1600].flatMap((width) =>
  [1, 1.5, 2].flatMap((dpr) =>
    [2, 3, 10, 30, 60].flatMap((distance) =>
      [-1, 1].map((delta) => ({ width, dpr, distance, delta })),
    ),
  ),
)

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

  /** 到达目标帧后再推进一次生命周期通知，模拟 renderer 先呈现终点。 */
  const settle = () => {
    step(1000)
    step(16)
  }

  it.each([1, 1.25, 1.5, 2, 3])('interpolates around the pointer slot at DPR=%s', (dpr) => {
    const { controller, viewport } = makeController(dpr)
    const before = viewport.readonly.viewSnapshot.peek()
    const pointer = before.grid.origin + before.grid.step * 4.37 - before.scroll
    controller.zoomOut(pointer)
    expect(controller.currentZoomLevel).toBe(6)
    step(40)
    expect(controller.currentZoomLevel).toBeGreaterThan(5)
    expect(controller.currentZoomLevel).toBeLessThan(6)
    for (const dt of [40, 40, 60]) {
      const view = viewport.readonly.viewSnapshot.peek()
      expectPixelAnchor(view, 4.37, pointer, dpr)
      step(dt)
    }
    settle()
    expect(controller.currentZoomLevel).toBe(5)
    expect(frames.size).toBe(0)
  })

  it.each(pointerAnchorCases)(
    'keeps the last several candles at the pointer throughout zoom, width=$width dpr=$dpr distance=$distance delta=$delta',
    ({ width, dpr, distance, delta }) => {
      const { controller, viewport } = makeController(dpr, 'daily', 600, width)
      controller.zoomToLevel(delta < 0 ? 4 : 5)
      const slot = 600 - distance + 0.2
      const anchor = width * 0.75
      const initial = viewport.readonly.viewSnapshot.peek()
      viewport.actions.scrollToLogical(initial.grid.origin + slot * initial.grid.step - anchor)
      if (delta < 0) controller.zoomIn(anchor)
      else controller.zoomOut(anchor)
      for (let frame = 0; frame < 12; frame++) {
        step(16)
        expectPixelAnchor(viewport.readonly.viewSnapshot.peek(), slot, anchor, dpr)
      }
      settle()
      expect(frames.size).toBe(0)
    },
  )

  it('accumulates wheel input and reverses smoothly from the current size', () => {
    const { controller } = makeController()
    controller.zoomOut(100)
    step(40)
    const intermediate = controller.currentZoomLevel
    controller.zoomOut(100)
    expect(controller.currentZoomLevel).toBe(intermediate)
    settle()
    expect(controller.currentZoomLevel).toBe(4)
    controller.zoomIn(100)
    step(40)
    const growing = controller.currentZoomLevel
    controller.zoomOut(100)
    expect(controller.currentZoomLevel).toBe(growing)
    settle()
    expect(controller.currentZoomLevel).toBe(Math.round(growing) - 1)
  })

  it.each(['min', 'max'] as const)('clamps every frame at the %s boundary', (side) => {
    const { controller, viewport } = makeController()
    controller.zoomToLevel(3)
    viewport.actions.scrollToLogical(side === 'min' ? -10000 : 10000)
    controller.zoomIn(side === 'min' ? 0 : 1000)
    for (let i = 0; i < 12; i++) {
      step(16)
      const view = viewport.readonly.viewSnapshot.peek()
      expect(view.scroll).toBeGreaterThanOrEqual(view.scrollBounds.min)
      expect(view.scroll).toBeLessThanOrEqual(view.scrollBounds.max)
      expect(Math.min(view.range.end, 10) - Math.max(view.range.start, 0)).toBeGreaterThanOrEqual(2)
    }
    settle()
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

  it('preserves wheel magnitude and applies equal scale ratios at different levels', () => {
    const { controller } = makeController()
    const ratios: number[] = []
    for (const level of [3, 5]) {
      controller.zoomToLevel(level)
      const width = controller.currentKWidth
      controller.handleWheel(100, 100)
      settle()
      ratios.push(controller.currentKWidth / width)
    }
    expect(ratios[0]).toBeCloseTo(ratios[1]!, 10)
    controller.zoomToLevel(5)
    controller.handleWheel(200, 100)
    settle()
    expect(controller.currentKWidth / 17.4).toBeCloseTo(ratios[0]! ** 2, 10)
  })

  it('normalizes line and pixel wheel units to the same zoom', () => {
    const { controller } = makeController()
    controller.handleWheel(3, 100, 1)
    settle()
    const lineWidth = controller.currentKWidth
    controller.zoomToLevel(6)
    controller.handleWheel(48, 100)
    settle()
    expect(controller.currentKWidth).toBeCloseTo(lineWidth, 10)
  })

  it('follows small pixel deltas and trackpad pinch without scheduling a tail', () => {
    const { controller } = makeController()
    controller.handleWheel(1, 100)
    expect(controller.currentZoomLevel).toBeLessThan(6)
    expect(controller.currentZoomLevel).toBeGreaterThan(5)
    expect(frames.size).toBe(0)
    controller.handleWheel(10, 100, 0, true)
    expect(frames.size).toBe(0)
    controller.handleWheel(20, 100)
    expect(frames.size).toBe(0)
    step(200)
    controller.handleWheel(20, 100)
    expect(frames.size).toBe(1)
  })

  it('retargets the existing frame and reverses without chasing queued zoom', () => {
    const { controller } = makeController()
    controller.zoomToLevel(3)
    controller.handleWheel(-100, 100)
    step(40)
    const pendingFrame = [...frames.keys()]
    controller.handleWheel(-100, 100)
    expect([...frames.keys()]).toEqual(pendingFrame)
    const width = controller.currentKWidth
    controller.handleWheel(100, 100)
    step(16)
    expect(controller.currentKWidth).toBeLessThan(width)
    settle()
    expect(controller.isAnimating).toBe(false)
  })

  it('integrates the same motion independently of frame rate', () => {
    const { controller } = makeController()
    controller.zoomOut()
    for (let i = 0; i < 10; i++) step(10)
    const level = controller.currentZoomLevel
    controller.zoomToLevel(6)
    controller.zoomOut()
    step(100)
    expect(controller.currentZoomLevel).toBeCloseTo(level, 10)
  })

  it.each([1, 1.25, 1.5, 2, 3])(
    'does not change geometry when the final animation frame becomes idle at DPR=%s',
    (dpr) => {
      const { controller, viewport } = makeController(dpr, 'daily', 600)
      controller.zoomToLevel(3)
      controller.zoomIn(317.37)
      step(300)
      expect(controller.isAnimating).toBe(true)
      expect(controller.currentZoomLevel).toBe(4)
      const finalFrame = viewport.readonly.viewSnapshot.peek()
      step(16)
      expect(controller.isAnimating).toBe(false)
      expect(viewport.readonly.viewSnapshot.peek()).toBe(finalFrame)
      step(16)
      expect(viewport.readonly.viewSnapshot.peek()).toBe(finalFrame)
    },
  )

  it.each([1, 1.25, 1.5, 2, 3])(
    'never reverses a displayed candle during the complete zoom tail at DPR=%s',
    (dpr) => {
      for (const direction of [-1, 1]) {
        const { controller, viewport } = makeController(dpr, 'daily', 600)
        controller.zoomToLevel(4)
        const before = viewport.readonly.viewSnapshot.peek()
        const anchor = 317.37
        const slot = 450.37
        viewport.actions.scrollToLogical(before.grid.origin + slot * before.grid.step - anchor)
        controller.handleWheel(-100 * direction, anchor)
        const previous = new Map<number, number>()
        let frame = 0
        while (controller.isAnimating && frame++ < 100) {
          step(8)
          const view = viewport.readonly.viewSnapshot.peek()
          for (const index of [448, 449, 450, 451, 452]) {
            const pixel = Math.round((view.worldAtIndex(index)! - view.scroll) * dpr)
            const last = previous.get(index)
            if (last !== undefined) {
              const movement = pixel - last
              expect(movement * Math.sign(index - slot) * direction).toBeGreaterThanOrEqual(0)
            }
            previous.set(index, pixel)
          }
        }
        expect(controller.isAnimating).toBe(false)
      }
    },
  )

  it.each([1, 1.25, 1.5, 2, 3])(
    'commits pixel-aligned geometry on every animation frame at DPR=%s',
    (dpr) => {
      const { controller, viewport } = makeController(dpr, 'daily', 600)
      controller.zoomToLevel(4)
      controller.handleWheel(-100, 317.37)
      let count = 0
      while (controller.isAnimating && count++ < 100) {
        step(16)
        const view = viewport.readonly.viewSnapshot.peek()
        for (let index = 0; index < view.centers.length; index++) {
          const center = view.centers[index]!
          const pixel = (center - view.scroll) * dpr
          expect(pixel).toBeCloseTo(Math.round(pixel), 9)
          expect(view.worldAtIndex(view.range.start + index)).toBeCloseTo(center, 9)
          const left = view.positions[index]!
          expect((left - view.scroll) * dpr).toBeCloseTo(Math.round((left - view.scroll) * dpr), 9)
          expect(view.kWidthPx / dpr).toBeGreaterThan(0)
        }
      }
      expect(count).toBeGreaterThan(1)
      expect(controller.isAnimating).toBe(false)
    },
  )

  it('preserves velocity when another wheel event extends the target', () => {
    const { controller } = makeController()
    controller.handleWheel(100, 100)
    step(40)
    const before = Math.log(controller.currentKWidth)
    step(0.01)
    const uninterruptedSpeed = (Math.log(controller.currentKWidth) - before) / 0.01
    controller.zoomToLevel(6)
    controller.handleWheel(100, 100)
    step(40)
    const retargeted = Math.log(controller.currentKWidth)
    controller.handleWheel(100, 100)
    step(0.01)
    const retargetedSpeed = (Math.log(controller.currentKWidth) - retargeted) / 0.01
    expect(retargetedSpeed / uninterruptedSpeed).toBeCloseTo(1, 2)
  })

  it('adopts a moved pointer without changing the currently displayed size', () => {
    const { controller, viewport } = makeController(1, 'daily', 600)
    controller.zoomToLevel(4)
    controller.handleWheel(-100, 300)
    step(40)
    const before = viewport.readonly.viewSnapshot.peek()
    const slot = (before.scroll + 500 - before.grid.origin) / before.grid.step
    controller.handleWheel(-100, 500)
    expect(controller.currentKWidth).toBe(before.kWidth)
    step(16)
    const after = viewport.readonly.viewSnapshot.peek()
    expectPixelAnchor(after, slot, 500, 1)
  })

  it('cancels motion after an external zoom state write', () => {
    const { controller, zoomState } = makeController()
    controller.zoomOut()
    step(40)
    zoomState.actions.setZoomLevel(2)
    step(16)
    expect(controller.currentZoomLevel).toBe(2)
    expect(frames.size).toBe(0)
  })

  it('does not overwrite external navigation or zoom state', () => {
    const { controller, viewport } = makeController()
    controller.zoomOut()
    step(40)
    viewport.actions.scrollToLogical(-100)
    const level = controller.currentZoomLevel
    step(16)
    expect(controller.currentZoomLevel).toBe(level)
    expect(viewport.readonly.viewSnapshot.peek().scroll).toBe(-100)
    expect(frames.size).toBe(0)
  })

  it('keeps slot spacing continuous below a physical pixel', () => {
    const { controller, viewport } = makeController()
    controller.zoomToLevel(3)
    const before = viewport.readonly.viewSnapshot.peek().grid.step
    controller.handlePinch(0.001, 100)
    const after = viewport.readonly.viewSnapshot.peek().grid.step
    expect(after).toBeGreaterThan(before)
    expect(after - before).toBeLessThan(0.01)
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
      expect(stepPx).toBeCloseTo(view.kWidth * dpr + gapPx, 10)
      const displayedStep = (view.worldAtIndex(1)! - view.worldAtIndex(0)!) * dpr
      expect(displayedStep).toBeCloseTo(Math.round(displayedStep), 9)
      expect(Math.abs(displayedStep - stepPx)).toBeLessThanOrEqual(1 + 1e-9)
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

  it('数据区域内缩放在最近物理像素保持鼠标槽位', () => {
    const { viewport, controller } = makeController()
    const before = viewport.readonly.viewSnapshot.peek()
    const pointer = before.grid.origin + 4.37 * before.grid.step - before.scroll
    controller.zoomToLevel(5, pointer)
    const after = viewport.readonly.viewSnapshot.peek()
    expectPixelAnchor(after, 4.37, pointer, 1)
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
          expectPixelAnchor(view, coordinate, pointer, 1)
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
