/** 价格轴范围口径：自动取数、来源筛选与手动范围裁决的纯策略回归。 */
import { PRICE_AXIS_RANGE_MODE } from '@/foundation/config/priceAxisRangeMode.js'
import { describe, expect, it } from 'vitest'
import type { PriceRange } from '../../../scale/index.js'
import {
  collectRangeContributions,
  computeAutoRange,
  type PaneRangeSourceInput,
  resolvePanePriceRange,
} from '../panePriceRange.js'

const RANGE = (minPrice: number, maxPrice: number): PriceRange => ({ minPrice, maxPrice })

describe('computeAutoRange', () => {
  it.each([
    {
      name: '全并：基准与来源取并集',
      rangeMode: PRICE_AXIS_RANGE_MODE.All,
      basis: RANGE(100, 200),
      contributions: [RANGE(300, 400)],
      expected: RANGE(100, 400),
    },
    {
      name: '全并：没有基准时只用来源',
      rangeMode: PRICE_AXIS_RANGE_MODE.All,
      basis: null,
      contributions: [RANGE(300, 400)],
      expected: RANGE(300, 400),
    },
    {
      name: '没有基准也没有来源',
      rangeMode: PRICE_AXIS_RANGE_MODE.All,
      basis: null,
      contributions: [],
      expected: null,
    },
    {
      name: '仅 K 线：来源一律不参与',
      rangeMode: PRICE_AXIS_RANGE_MODE.Bars,
      basis: RANGE(100, 200),
      contributions: [RANGE(300, 400)],
      expected: RANGE(100, 200),
    },
    {
      name: '仅 K 线：没有基准时仍按来源定轴',
      rangeMode: PRICE_AXIS_RANGE_MODE.Bars,
      basis: null,
      contributions: [RANGE(300, 400)],
      expected: RANGE(300, 400),
    },
    {
      name: '手动：初始化按全并口径',
      rangeMode: PRICE_AXIS_RANGE_MODE.Manual,
      basis: RANGE(100, 200),
      contributions: [RANGE(300, 400)],
      expected: RANGE(100, 400),
    },
  ])('$name', ({ rangeMode, basis, contributions, expected }) => {
    expect(computeAutoRange({ rangeMode, basis, contributions })).toEqual(expected)
  })

  it('固定占比：基准按 70% 向上下等分留白', () => {
    const range = computeAutoRange({
      rangeMode: PRICE_AXIS_RANGE_MODE.Ratio,
      basis: RANGE(100, 200),
      contributions: [RANGE(300, 400)],
    })
    expect(range!.minPrice).toBeCloseTo(78.5714, 4)
    expect(range!.maxPrice).toBeCloseTo(221.4286, 4)
  })

  it('固定占比：平盘没有可比距离，范围保持基准', () => {
    expect(
      computeAutoRange({
        rangeMode: PRICE_AXIS_RANGE_MODE.Ratio,
        basis: RANGE(100, 100),
        contributions: [],
      }),
    ).toEqual(RANGE(100, 100))
  })
})

describe('collectRangeContributions', () => {
  const base: PaneRangeSourceInput = {
    rangeMode: PRICE_AXIS_RANGE_MODE.All,
    isPriceSeries: true,
    useIndicatorScheduler: true,
    comparisonActive: false,
    indicatorRange: { min: 300, max: 400 },
    footprintRange: RANGE(50, 60),
    drawingRange: RANGE(500, 600),
  }

  it.each([
    {
      name: '全并：指标、足迹、绘图都参与',
      input: base,
      expected: [RANGE(300, 400), RANGE(50, 60), RANGE(500, 600)],
    },
    {
      name: '全并：不用指标调度器时只缺指标',
      input: { ...base, useIndicatorScheduler: false },
      expected: [RANGE(50, 60), RANGE(500, 600)],
    },
    {
      name: '全并：比较投影接管基准后足迹不再叠加',
      input: { ...base, comparisonActive: true },
      expected: [RANGE(300, 400), RANGE(500, 600)],
    },
    {
      name: '指标轴没有行情来源，只并入绘图',
      input: { ...base, isPriceSeries: false },
      expected: [RANGE(500, 600)],
    },
    { name: '仅 K 线：不收集任何来源', input: { ...base, rangeMode: PRICE_AXIS_RANGE_MODE.Bars }, expected: [] },
    {
      name: '固定占比：不收集任何来源',
      input: { ...base, rangeMode: PRICE_AXIS_RANGE_MODE.Ratio },
      expected: [],
    },
    {
      name: '手动：初始化按全并收集',
      input: { ...base, rangeMode: PRICE_AXIS_RANGE_MODE.Manual },
      expected: [RANGE(300, 400), RANGE(50, 60), RANGE(500, 600)],
    },
  ])('$name', ({ input, expected }) => {
    expect(collectRangeContributions(input)).toEqual(expected)
  })
})

describe('resolvePanePriceRange', () => {
  it.each([
    {
      name: '自动口径直接采用本帧结果',
      rangeMode: PRICE_AXIS_RANGE_MODE.Bars,
      currentRange: RANGE(1, 2),
      autoRange: RANGE(3, 4),
      expected: { range: RANGE(3, 4), basePrice: null, initializeRange: false },
    },
    {
      name: '手动已有范围时不再重算',
      rangeMode: PRICE_AXIS_RANGE_MODE.Manual,
      currentRange: RANGE(1, 2),
      autoRange: RANGE(3, 4),
      expected: { range: RANGE(1, 2), basePrice: null, initializeRange: false },
    },
    {
      name: '手动首次用本帧结果回填',
      rangeMode: PRICE_AXIS_RANGE_MODE.Manual,
      currentRange: null,
      autoRange: RANGE(3, 4),
      expected: { range: RANGE(3, 4), basePrice: null, initializeRange: true },
    },
    {
      name: '手动首次没有可用结果时保留上一帧',
      rangeMode: PRICE_AXIS_RANGE_MODE.Manual,
      currentRange: null,
      autoRange: null,
      expected: { range: null, basePrice: null, initializeRange: false },
    },
  ])('$name', ({ rangeMode, currentRange, autoRange, expected }) => {
    expect(
      resolvePanePriceRange({ rangeMode, currentRange, autoRange, basePrice: null }),
    ).toEqual(expected)
  })
})
