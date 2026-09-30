import { describe, expect, it } from 'vitest'
import { createViewportStateDeps } from '../../state/__tests__/helpers/createViewportStateDeps'
import { createViewportState } from '../../state/viewportState'
import {
  clampVisibleRange,
  computeMaxScrollLeftWithVisibleData,
  DEFAULT_FUTURE_SCREENS,
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

    // 未来时间轴：拖到最右后窗口右缘越过数据尾，进入未来槽位
    expect(module.readonly.visibleRange().end).toBeGreaterThan(10)
  })
})

describe('viewportState futureScreens', () => {
  /** 50 根数据、unitPx=10 的基准场景；用例只覆盖 futureScreens 差异。 */
  const base = { dataLength: 50, options: { kWidth: 8, kGap: 2 } as const }
  /** 0 屏未来区（走 trailing 30 槽）时的滚动上限。 */
  const MAX_SCROLL_NO_FUTURE = 803

  /** 把 viewport 滚到最右并返回派生滚动上限。 */
  const scrollToMax = (module: ReturnType<typeof createViewportState>): number => {
    module.actions.resize(400, 400, 1)
    module.actions.scrollTo(Number.MAX_SAFE_INTEGER)
    return module.readonly.maxScrollLeft()
  }

  it('maxScrollLeft 含 3 屏未来区（比 0 屏多出 (120-30) 个槽位）', () => {
    // 3 屏 futureBars=ceil(400/10)*3=120 槽 → 1703
    const max0 = scrollToMax(
      createViewportState(createViewportStateDeps({ ...base, futureScreens: 0 })),
    )
    const max3 = scrollToMax(
      createViewportState(createViewportStateDeps({ ...base, futureScreens: 3 })),
    )
    expect(max0).toBe(MAX_SCROLL_NO_FUTURE)
    expect(max3).toBe(1703)
  })

  it('缺省 futureScreens 时解析为 DEFAULT_FUTURE_SCREENS', () => {
    const explicit = scrollToMax(
      createViewportState(
        createViewportStateDeps({ ...base, futureScreens: DEFAULT_FUTURE_SCREENS }),
      ),
    )
    const deps = createViewportStateDeps(base)
    const module = createViewportState(deps)
    expect(scrollToMax(module)).toBe(explicit)
    deps.options$.set({ bottomAxisHeight: 30, kWidth: 8, kGap: 2, futureScreens: 0 })
    expect(scrollToMax(module)).toBe(MAX_SCROLL_NO_FUTURE)
  })

  it('rawVisibleRange：滚到最右时 end 停在数据尾 + futureBars', () => {
    const module = createViewportState(
      createViewportStateDeps({
        dataLength: 10,
        options: { kWidth: 8, kGap: 2 },
        futureScreens: 1,
      }),
    )
    module.actions.resize(400, 400, 1)
    module.actions.scrollTo(Number.MAX_SAFE_INTEGER)

    // unitPx=10，futureBars=ceil(400/10)=40 → end = 10 + 40 + 1 = 51
    expect(module.readonly.rawVisibleRange()).toEqual({ start: 9, end: 51 })
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
})
