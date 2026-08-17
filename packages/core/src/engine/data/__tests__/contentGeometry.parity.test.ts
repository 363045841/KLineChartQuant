import { describe, expect, it } from 'vitest'

import { SCROLL_TRAILING_SLOTS } from '../scrollCompensator'
import { getPhysicalKLineConfig } from '../../utils/klineConfig'
import {
  computeContentWidth,
  computeLeftLoadBufferWidth,
  computeMaxScrollLeft,
  type ContentGeometryInput,
} from '../../state/contentGeometry'

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

  it('timeshare → left buffer 0, content = max(viewWidth, 1) with no left buffer', () => {
    const input = baseInput({ period: 'timeshare', dataLength: 50, viewWidth: 800 })
    expect(computeLeftLoadBufferWidth(input)).toBe(0)
    expect(computeContentWidth(input)).toBe(Math.max(800, 1))

    const narrow = baseInput({ period: 'timeshare', dataLength: 10, viewWidth: 0 })
    expect(computeLeftLoadBufferWidth(narrow)).toBe(0)
    expect(computeContentWidth(narrow)).toBe(1)
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
})
