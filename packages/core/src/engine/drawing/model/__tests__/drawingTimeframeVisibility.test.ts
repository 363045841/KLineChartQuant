/** 周期可见性规则的唯一求值入口：只验证高低周期边界，不重复投影用例。 */
import type { DrawingTimeframeVisibility } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it } from 'vitest'

import { isDrawingVisibleInPeriod } from '../impl/drawingTimeframeVisibility'

const cases: ReadonlyArray<{
  readonly name: string
  readonly visibility: DrawingTimeframeVisibility | undefined
  readonly period: string
  readonly visible: boolean
}> = [
  { name: '未配置规则', visibility: undefined, period: 'daily', visible: true },
  { name: '所有周期', visibility: { mode: 'all' }, period: '1min', visible: true },
  {
    name: '当前及以上包含参考周期',
    visibility: { mode: 'above', period: '60min' },
    period: '60min',
    visible: true,
  },
  {
    name: '当前及以上包含更高周期',
    visibility: { mode: 'above', period: '60min' },
    period: 'daily',
    visible: true,
  },
  {
    name: '当前及以上排除更低周期',
    visibility: { mode: 'above', period: '60min' },
    period: '15min',
    visible: false,
  },
  {
    name: '当前及以下包含更低周期',
    visibility: { mode: 'below', period: '60min' },
    period: '5min',
    visible: true,
  },
  {
    name: '当前及以下排除更高周期',
    visibility: { mode: 'below', period: '60min' },
    period: 'daily',
    visible: false,
  },
  {
    name: '仅当前只匹配参考周期',
    visibility: { mode: 'current', period: 'daily' },
    period: 'daily',
    visible: true,
  },
  {
    name: '仅当前排除其它周期',
    visibility: { mode: 'current', period: 'daily' },
    period: 'weekly',
    visible: false,
  },
]

describe('isDrawingVisibleInPeriod', () => {
  it.each(cases)('$name', ({ visibility, period, visible }) => {
    expect(isDrawingVisibleInPeriod(visibility, period)).toBe(visible)
  })
})
