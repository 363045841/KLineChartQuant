/** 导航纯契约：拒绝非法输入、收敛缩放、按宽度解算声明式目标。 */
import { describe, expect, it } from 'vitest'
import {
  clampNavigation,
  initialNavigation,
  projectPlot,
  timeNavigationToSlots,
} from '../navigation'

const zoom = { minKWidth: 1, maxKWidth: 20, zoomLevelCount: 10 }
const bars = Array.from({ length: 100 }, (_, index) => ({ timestamp: 1_000 + index * 1_000 }))
const data = bars.map((bar) => ({ ...bar, price: 10, average: 10, volume: 1 }))
const geometry = { plotWidth: 800, dpr: 1, gapRatio: 0.2 }

const project = (navigation: Parameters<typeof projectPlot>[0]['navigation']) =>
  projectPlot({
    view: 'kline',
    navigation,
    width: geometry.plotWidth,
    dpr: geometry.dpr,
    data,
    dataLength: data.length,
    marketSession: null,
    timeShareRange: null,
    gapRatio: geometry.gapRatio,
    zoom,
  })

describe('clampNavigation', () => {
  it('rejects non-finite precise coordinates instead of substituting a value', () => {
    expect(
      clampNavigation(
        { kind: 'slots', scroll: Number.NaN, zoomLevel: 3, sessionSlotWidth: null },
        zoom,
      ),
    ).toBeNull()
    expect(clampNavigation({ kind: 'latest', zoomLevel: Number.POSITIVE_INFINITY }, zoom)).toBeNull()
    expect(clampNavigation({ kind: 'time', fromTime: 2, toTime: 1 }, zoom)).toBeNull()
  })

  it('clamps the level and drops unusable slot width', () => {
    expect(
      clampNavigation({ kind: 'slots', scroll: 10, zoomLevel: 99, sessionSlotWidth: 0 }, zoom),
    ).toEqual({ kind: 'slots', scroll: 10, zoomLevel: 10, sessionSlotWidth: null })
    expect(
      clampNavigation({ kind: 'slots', scroll: 10, zoomLevel: -5, sessionSlotWidth: 2 }, zoom),
    ).toEqual({ kind: 'slots', scroll: 10, zoomLevel: 1, sessionSlotWidth: 2 })
  })

  it('keeps declarative targets intact', () => {
    expect(clampNavigation({ kind: 'latest', zoomLevel: 4 }, zoom)).toEqual({
      kind: 'latest',
      zoomLevel: 4,
    })
    expect(clampNavigation({ kind: 'time', fromTime: 10, toTime: 20 }, zoom)).toEqual({
      kind: 'time',
      fromTime: 10,
      toTime: 20,
    })
  })
})

describe('projectPlot', () => {
  it('derives the K-line width from the zoom target', () => {
    expect(project(initialNavigation(1)).kWidth).toBe(1)
    expect(project(initialNavigation(10)).kWidth).toBe(20)
  })

  it('pins a latest target to the newest bar regardless of width', () => {
    const narrow = projectPlot({
      view: 'kline',
      navigation: { kind: 'latest', zoomLevel: 6 },
      width: 400,
      dpr: 1,
      data,
      dataLength: data.length,
      marketSession: null,
      timeShareRange: null,
      gapRatio: geometry.gapRatio,
      zoom,
    })
    const wide = project(initialNavigation(6))
    expect(narrow.snapshot.range.end).toBe(wide.snapshot.range.end)
    expect(narrow.snapshot.scroll).toBeGreaterThan(wide.snapshot.scroll)
  })

  it('is pure: projecting the same target twice yields the same geometry', () => {
    const first = project({ kind: 'slots', scroll: 120, zoomLevel: 4, sessionSlotWidth: null })
    const second = project({ kind: 'slots', scroll: 120, zoomLevel: 4, sessionSlotWidth: null })
    expect(second.snapshot.scroll).toBe(first.snapshot.scroll)
    expect(second.snapshot.grid).toEqual(first.snapshot.grid)
  })
})

describe('timeNavigationToSlots', () => {
  it('cannot resolve without measurable width', () => {
    expect(
      timeNavigationToSlots(bars, 1_000, 2_000, { ...geometry, plotWidth: 0 }, zoom),
    ).toBeNull()
  })

  it('cannot resolve a window the loaded data does not cover', () => {
    expect(timeNavigationToSlots(bars, 0, 500, geometry, zoom)).toBeNull()
    expect(timeNavigationToSlots(bars, 200_000, 300_000, geometry, zoom)).toBeNull()
  })

  it('places the first visible bar at the left edge', () => {
    const slots = timeNavigationToSlots(
      bars,
      bars[20]!.timestamp,
      bars[40]!.timestamp,
      geometry,
      zoom,
    )
    expect(slots).not.toBeNull()
    const projected = project(slots!)
    // 投影含两侧各一根渲染缓冲，可见起点允许偏差两根。
    expect(projected.snapshot.range.start).toBeGreaterThanOrEqual(18)
    expect(projected.snapshot.range.start).toBeLessThanOrEqual(20)
  })
})
