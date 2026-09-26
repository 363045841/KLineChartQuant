import { describe, expect, it } from 'vitest'
import {
  type ContentGeometryInput,
  computeContentWidth,
  computeLeftLoadBufferWidth,
  computeMaxScrollLeft,
} from '../../state/contentGeometry'
import { getPhysicalKLineConfig } from '../../utils/klineConfig'
import { SCROLL_TRAILING_SLOTS } from '../scrollCompensator'

const baseInput = (overrides: Partial<ContentGeometryInput> = {}): ContentGeometryInput => ({
  viewWidth: 800,
  plotWidth: 800,
  dataLength: 100,
  period: 'daily',
  dpr: 1,
  kWidth: 8,
  kGap: 2,
  ...overrides,
})

describe('contentGeometry parity', () => {
  it('dataLength 0 → left buffer 0, content 0', () => {
    const input = baseInput({ dataLength: 0 })
    expect(computeLeftLoadBufferWidth(input)).toBe(0)
    expect(computeContentWidth(input)).toBe(0)
  })

  it('timeshare → left buffer 0 and becomes scrollable when session slots exceed the viewport', () => {
    const input = baseInput({
      period: 'timeshare',
      dataLength: 50,
      viewWidth: 800,
      sessionSlots: 240,
    })
    expect(computeLeftLoadBufferWidth(input)).toBe(0)
    expect(computeContentWidth(input)).toBe(Math.max(800, 1))

    const narrow = baseInput({
      period: 'timeshare',
      dataLength: 10,
      viewWidth: 100,
      dpr: 1,
      sessionSlots: 240,
    })
    expect(computeLeftLoadBufferWidth(narrow)).toBe(0)
    expect(computeContentWidth(narrow)).toBe(240)
    expect(computeMaxScrollLeft(computeContentWidth(narrow), narrow.viewWidth)).toBe(140)
  })

  it('five-day timeshare becomes scrollable when physical session slots exceed the viewport', () => {
    const input = baseInput({
      period: '5daytimeshare',
      dataLength: 1000,
      viewWidth: 500,
      dpr: 1,
      timeShareDayCount: 5,
      sessionSlots: 241,
    })

    expect(computeLeftLoadBufferWidth(input)).toBe(0)
    expect(computeContentWidth(input)).toBe(1205)
    expect(computeMaxScrollLeft(computeContentWidth(input), input.viewWidth)).toBe(705)
  })

  it('expands timeshare content width when a zoomed slot exceeds its minimum physical width', () => {
    const input = baseInput({
      period: 'timeshare',
      dataLength: 240,
      viewWidth: 320,
      dpr: 1,
      sessionSlots: 240,
      timeShareSlotWidth: 3,
    })

    expect(computeContentWidth(input)).toBe(720)
    expect(computeMaxScrollLeft(computeContentWidth(input), input.viewWidth)).toBe(400)
  })

  it('kline with data → left buffer = Math.round(viewWidth)', () => {
    const input = baseInput({ dataLength: 100, period: 'daily', viewWidth: 800.4 })
    expect(computeLeftLoadBufferWidth(input)).toBe(Math.round(800.4))
  })

  it('kline contentWidth uses SCROLL_TRAILING_SLOTS (30) historical formula', () => {
    expect(SCROLL_TRAILING_SLOTS).toBe(30)

    const input = baseInput({
      dataLength: 100,
      period: 'daily',
      viewWidth: 800,
      dpr: 2,
      kWidth: 8,
      kGap: 2,
    })
    const left = computeLeftLoadBufferWidth(input)
    const { startXPx, unitPx } = getPhysicalKLineConfig(input.kWidth, input.kGap, input.dpr)
    const dataPlotWidth =
      (startXPx + (input.dataLength + SCROLL_TRAILING_SLOTS) * unitPx) / input.dpr
    const expected = left + Math.max(dataPlotWidth, input.viewWidth)

    expect(computeContentWidth(input)).toBe(expected)
  })

  it('computeMaxScrollLeft = max(0, contentWidth - viewWidth)', () => {
    expect(computeMaxScrollLeft(1200, 800)).toBe(400)
    expect(computeMaxScrollLeft(500, 800)).toBe(0)
    expect(computeMaxScrollLeft(800, 800)).toBe(0)
  })

  it('内容宽度覆盖 futureScreens 屏未来滚动范围（dpr=1）', () => {
    const input = baseInput({ viewWidth: 1000, plotWidth: 1000, dataLength: 100, futureScreens: 3 })
    // baseInput 默认 kWidth=8/kGap=2/dpr=1 → kWidthPx=7, unitPx=9
    // futureBars = ceil(1000/9) * 3 = 336；内容必须覆盖滚动上限所需的 rawMax：
    // 左缓冲 1000 + (startXPx + (99 + 336) * 9) = 4917
    const { startXPx, unitPx } = getPhysicalKLineConfig(input.kWidth, input.kGap, input.dpr)
    const futureBars = Math.ceil((input.plotWidth * input.dpr) / unitPx) * 3
    const rawMaxScrollNeed =
      computeLeftLoadBufferWidth(input) + (startXPx + (100 - 1 + futureBars) * unitPx) / input.dpr
    const width = computeContentWidth(input)
    // 断言语义与"两侧同减 viewWidth"的旧写法等价：内容宽度覆盖未来滚动所需的 rawMax
    expect(width).toBeGreaterThanOrEqual(rawMaxScrollNeed)
    expect(width).toBe(input.viewWidth + (startXPx + (100 + futureBars) * unitPx) / input.dpr)
  })

  it('futureBars 换算按物理像素（dpr=2）', () => {
    // dpr=2: kWidthPx=15, kGapPx=4 → unitPx=19, startXPx=4
    // futureBars = ceil(plotWidth*2/19) * 2（futureScreens=2），trailingSlots = max(30, futureBars)
    const input = baseInput({ dpr: 2, dataLength: 50, futureScreens: 2 })
    const { startXPx, unitPx } = getPhysicalKLineConfig(input.kWidth, input.kGap, input.dpr)
    const futureBars =
      Math.ceil((input.plotWidth * input.dpr) / unitPx) * (input.futureScreens ?? 0)
    const expected =
      computeLeftLoadBufferWidth(input) + (startXPx + (50 + Math.max(30, futureBars)) * unitPx) / 2
    expect(computeContentWidth(input)).toBe(expected)
  })
})
