/** 内容几何在 K 线和分时模式下的边界回归。 */
import { describe, expect, it } from 'vitest'
import {
  type ContentGeometryInput,
  computeContentGeometry,
  computeContentWidth,
  computeLeftLoadBufferWidth,
  computeMaxScrollLeft,
} from '../../state/contentGeometry'
import { getPhysicalKLineConfig } from '../../utils/klineConfig'

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

  it('K 线初始内容包含完整数据与一屏未来槽位', () => {
    const input = baseInput({
      dataLength: 100,
      period: 'daily',
      viewWidth: 800,
      dpr: 2,
      kWidth: 8,
      kGap: 2,
    })
    const left = computeLeftLoadBufferWidth(input)
    const { unitPx } = getPhysicalKLineConfig(input.kWidth, input.kGap, input.dpr)
    const expectedMax = left + (input.dataLength * unitPx) / input.dpr
    expect(computeContentWidth(input)).toBe(expectedMax + input.viewWidth)
    expect(computeContentGeometry(input).maxScrollLeft).toBe(expectedMax)
  })

  it('computeMaxScrollLeft = max(0, contentWidth - viewWidth)', () => {
    expect(computeMaxScrollLeft(1200, 800)).toBe(400)
    expect(computeMaxScrollLeft(500, 800)).toBe(0)
    expect(computeMaxScrollLeft(800, 800)).toBe(0)
  })

  it('初始未来区覆盖一屏，不足一槽仍保留可索引的部分槽位', () => {
    const geometry = computeContentGeometry(baseInput({ viewWidth: 101, plotWidth: 101 }))
    expect(geometry.futureWidth).toBe(101)
    expect(geometry.futureBarCount).toBe(12)
  })
})
