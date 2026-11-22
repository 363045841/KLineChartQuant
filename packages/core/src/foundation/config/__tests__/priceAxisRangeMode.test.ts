/** 价格轴范围模式的可选集合：只看当前轴能不能按可见 K 线定轴。 */
import { describe, expect, it } from 'vitest'
import {
  availablePriceRangeModes,
  PRICE_AXIS_RANGE_MODE,
  resolvePriceAxisRangeMode,
} from '../priceAxisRangeMode.js'

const { All, Bars, Ratio, Manual } = PRICE_AXIS_RANGE_MODE

describe('availablePriceRangeModes', () => {
  it.each([
    {
      name: '能按可见 K 线定轴：三档自动口径与手动都可用',
      fitsPriceBars: true,
      expected: [All, Bars, Ratio, Manual],
    },
    {
      name: '只能按自身数值区间定轴：只有全并与手动',
      fitsPriceBars: false,
      expected: [All, Manual],
    },
  ])('$name', ({ fitsPriceBars, expected }) => {
    expect(availablePriceRangeModes(fitsPriceBars)).toEqual(expected)
  })
})

describe('resolvePriceAxisRangeMode', () => {
  it.each([
    { name: '能拟合 K 线时保留用户选择', fitsPriceBars: true, stored: Ratio, expected: Ratio },
    { name: '只能按数值定轴时按全并执行', fitsPriceBars: false, stored: Ratio, expected: All },
    { name: '手动模式与 K 线能力无关', fitsPriceBars: false, stored: Manual, expected: Manual },
  ])('$name', ({ fitsPriceBars, stored, expected }) => {
    expect(resolvePriceAxisRangeMode(fitsPriceBars, stored)).toBe(expected)
  })
})
