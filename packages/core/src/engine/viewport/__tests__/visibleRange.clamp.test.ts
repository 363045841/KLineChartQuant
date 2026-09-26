import { describe, expect, it } from 'vitest'
import { createViewportStateDeps } from '../../state/__tests__/helpers/createViewportStateDeps'
import { createViewportState } from '../../state/viewportState'
import {
  clampVisibleRange,
  computeMaxScrollLeftWithVisibleData,
  getVisibleRange,
} from '../viewport'

describe('clampVisibleRange', () => {
  it('clamps negative start to 0 and preserves end', () => {
    expect(clampVisibleRange({ start: -1, end: 40 })).toEqual({ start: 0, end: 40 })
  })

  it('leaves non-negative start unchanged', () => {
    expect(clampVisibleRange({ start: 12, end: 50 })).toEqual({ start: 12, end: 50 })
  })
})

describe('getVisibleRange raw expansion', () => {
  it('may return start < 0 when scroll is near the left edge (expansion pad)', () => {
    // scrollLeft=0, first bars sit near plot origin → start-1 扩窗
    const raw = getVisibleRange(0, 800, 8, 2, 100, 1)
    expect(raw.start).toBeLessThan(0)
    expect(raw.end).toBeGreaterThan(0)
  })
})

describe('computeMaxScrollLeftWithVisibleData', () => {
  it('limits the trailing blank slots before the visible range becomes empty', () => {
    const maxScrollLeft = computeMaxScrollLeftWithVisibleData(1_000, 0, 8, 2, 10, 1)
    const range = getVisibleRange(maxScrollLeft, 1, 8, 2, 10, 1)

    expect(maxScrollLeft).toBe(83)
    expect(range.start).toBeLessThan(10)
  })

  it('preserves the content boundary when there is no data', () => {
    expect(computeMaxScrollLeftWithVisibleData(1_000, 0, 8, 2, 0, 1)).toBe(1_000)
  })
})

describe('viewportState visibleRange SSOT', () => {
  it('exposes clamped visibleRange/visibleFrom while keeping rawVisibleRange for load triggers', async () => {
    const module = createViewportState(
      createViewportStateDeps({ dataLength: 20, options: { kWidth: 8, kGap: 2 }, zoomLevel: 3 }),
    )

    // resize 后 scrollLeftLogical≈0（右对齐短序列或左缘），raw start 常为 -1
    module.actions.resize(800, 400, 1)
    module.actions.scrollTo(module.readonly.leftLoadBufferWidth.peek())

    const raw = module.readonly.rawVisibleRange()
    const clamped = module.readonly.visibleRange()
    const vs = module.readonly.viewportState()

    expect(raw.start).toBeLessThan(0)
    expect(clamped.start).toBe(0)
    expect(clamped.end).toBe(raw.end)
    expect(vs.visibleFrom).toBe(0)
    expect(vs.visibleTo).toBe(clamped.end)
  })

  it('timeshare visible range covers full data regardless of kWidth rounding (slot grid)', () => {
    const module = createViewportState(
      createViewportStateDeps({
        dataLength: 240,
        options: { kWidth: 3, kGap: 1 },
        period: 'timeshare',
        zoomLevel: 3,
      }),
    )
    // 旧实现（kWidth/kGap 取整网格）在 W=900, kWidth=3, kGap=1 时 end 只有 226
    module.actions.resize(900, 400, 1)
    const raw = module.readonly.rawVisibleRange()
    const clamped = module.readonly.visibleRange()
    expect(raw.start).toBe(-1)
    expect(clamped.start).toBe(0)
    expect(clamped.end).toBe(240)
    expect(raw.end).toBe(240)
  })

  it('lets the window enter future slots at the maximum scroll position after zooming in', () => {
    const module = createViewportState(
      createViewportStateDeps({ dataLength: 10, options: { kWidth: 100, kGap: 2 }, zoomLevel: 3 }),
    )

    module.actions.resize(100, 400, 1)
    module.actions.scrollTo(Number.MAX_SAFE_INTEGER)

    const range = module.readonly.visibleRange()
    // 未来时间轴：默认 DEFAULT_FUTURE_SCREENS(3) 屏下拖到最右，窗口可整体进入未来槽位
    // （futureBars = ceil(100/102)*3 = 3），end 被夹在数据尾 + futureBars + 扩窗 1 内
    expect(range.end).toBeGreaterThanOrEqual(10)
    expect(range.end).toBeLessThanOrEqual(10 + 3 + 1)
  })
})

describe('viewportState futureScreens', () => {
  /** 把 viewport 滚到最右并返回派生滚动上限。 */
  const scrollToMax = (module: ReturnType<typeof createViewportState>): number => {
    module.actions.resize(400, 400, 1)
    module.actions.scrollTo(Number.MAX_SAFE_INTEGER)
    return module.readonly.maxScrollLeft()
  }

  it('maxScrollLeft：futureScreens=3 显著大于 0 屏（差值 ≈ 3 屏槽位）', () => {
    const base = { dataLength: 50, options: { kWidth: 8, kGap: 2 } as const }
    const max0 = scrollToMax(
      createViewportState(createViewportStateDeps({ ...base, futureScreens: 0 })),
    )
    const max3 = scrollToMax(
      createViewportState(createViewportStateDeps({ ...base, futureScreens: 3 })),
    )
    // plotWidth=400, dpr=1 → kGap 由 deriveKGap(8,1)=3 推导，kWidthPx=7 → unitPx=10
    const unitPx = 10
    const screenSlots = Math.ceil(400 / unitPx)
    expect(max3 - max0).toBeGreaterThanOrEqual((screenSlots - 1) * (unitPx / 1))
    expect(max3).toBeGreaterThan(max0)
  })

  it('缺省 futureScreens 时使用 DEFAULT_FUTURE_SCREENS（3 屏）', () => {
    const deps = createViewportStateDeps({ dataLength: 50, options: { kWidth: 8, kGap: 2 } })
    const module = createViewportState(deps)
    const maxDefault = scrollToMax(module)
    deps.options$.set({ bottomAxisHeight: 30, kWidth: 8, kGap: 2, futureScreens: 0 })
    expect(scrollToMax(module)).toBeLessThan(maxDefault)
  })

  it('rawVisibleRange：滚到最右时 end 被夹在数据尾 + futureBars + 扩窗 1 内', () => {
    const module = createViewportState(
      createViewportStateDeps({
        dataLength: 10,
        options: { kWidth: 8, kGap: 2 },
        futureScreens: 1,
      }),
    )
    module.actions.resize(400, 400, 1)
    module.actions.scrollTo(Number.MAX_SAFE_INTEGER)

    const raw = module.readonly.rawVisibleRange()
    // dpr=1 → deriveKGap(8,1)=3 → kWidthPx=7 + 3 = unitPx=10；futureBars = ceil(400/10) = 40
    const futureBars = Math.ceil((400 * 1) / 10)
    expect(raw.end).toBeLessThanOrEqual(10 + futureBars + 1)
    expect(raw.end).toBeGreaterThan(10)
  })

  it('分时（timeshare）分支不受 futureScreens 影响', () => {
    const module = createViewportState(
      createViewportStateDeps({
        dataLength: 240,
        options: { kWidth: 3, kGap: 1 },
        period: 'timeshare',
        sessionSlots: 240,
        futureScreens: 3,
      }),
    )
    module.actions.resize(900, 400, 1)
    module.actions.scrollTo(Number.MAX_SAFE_INTEGER)
    const raw = module.readonly.rawVisibleRange()
    expect(raw.start).toBe(-1)
    expect(raw.end).toBe(240)
  })

  it('内容一致性：contentWidth - viewWidth >= maxScrollLeft（内容覆盖未来区滚动上限）', () => {
    const module = createViewportState(
      createViewportStateDeps({
        dataLength: 20,
        options: { kWidth: 8, kGap: 2 },
        futureScreens: 3,
      }),
    )
    module.actions.resize(400, 400, 1)
    expect(module.readonly.contentWidth() - module.readonly.viewWidth()).toBeGreaterThanOrEqual(
      module.readonly.maxScrollLeft(),
    )
  })
})
