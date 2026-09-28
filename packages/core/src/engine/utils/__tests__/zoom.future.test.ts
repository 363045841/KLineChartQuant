/**
 * computeZoom 未来区（future time axis）测试。
 *
 * 覆盖：
 * - futureScreens 传入时，缩放后的 maxScroll 裁剪含未来区槽位（拖入未来区缩放不被拉回数据右缘）
 * - 不传 futureScreens 时，结果与旧公式（TRAILING_SLOTS=30 路径）完全一致
 *
 * 数值基准：dpr=1，级别 6→5 缩小一级（kWidth 21→17.4，kGapPx 均钳 3），
 * 旧路径 unitPx=24/startXPx=3，新路径 unitPx=20/startXPx=3。
 */
import { describe, expect, it } from 'vitest'
import type { ZoomConfig } from '../zoom'
import { computeZoom, kGapFromKWidth } from '../zoom'

/** 构造 ZoomConfig：plotWidth=clientWidth=1000，dataLength=10（数据远窄于一屏） */
function makeConfig(futureScreens?: number): ZoomConfig {
  return {
    minKWidth: 3,
    maxKWidth: 21,
    zoomLevelCount: 6,
    dpr: 1,
    dataLength: 10,
    plotWidth: 1000,
    clientWidth: 1000,
    ...(futureScreens !== undefined ? { futureScreens } : {}),
  }
}

describe('computeZoom future region', () => {
  it('futureScreens=3：缩放锚点落入未来区时 newDomScrollLeft 不被 30 槽旧上限截断', () => {
    // 拖入未来区：scrollLeft=2000 已超旧路径 maxScroll(=1000)，锚点 mouseX=900
    const result = computeZoom(-1, 900, 2000, 6, 21, kGapFromKWidth(21, 1), makeConfig(3))
    if (!result) throw new Error('computeZoom 应返回结果')

    // 锚点保持：anchorWorldPx=2900 → slotFloat=2897/24 → newScrollLeft=36412/24
    expect(result.newScrollLeft).toBeCloseTo(36412 / 24, 10)
    // futureBars=ceil(1000/20)*3=150 → trailingSlots=150 → maxScroll=3203，dom=2517.1667 不截断
    expect(result.newDomScrollLeft).toBe(2517)
  })

  it('不传 futureScreens：结果与旧公式（TRAILING_SLOTS=30）完全一致', () => {
    const result = computeZoom(-1, 900, 2000, 6, 21, kGapFromKWidth(21, 1), makeConfig())
    if (!result) throw new Error('computeZoom 应返回结果')

    // 旧公式：trailingSlots=30 → dataPlotWidth=803 → maxScroll=1000，dom 被截断为 1000
    expect(result.newDomScrollLeft).toBe(1000)
  })
})
