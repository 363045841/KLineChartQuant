/** 原生比较投影测试：主品种 OHLC、延迟起点、缺口与视口基准重算。 */
import { describe, expect, it } from 'vitest'
import type { KLineData } from '../../../../../foundation/types/price.js'
import { projectComparison } from '../comparisonProjection.js'
import type { ComparisonData } from '../types.js'

/** 同日期的不同时间点用于验证按时间戳匹配。 */
function bar(timestamp: number, close: number): KLineData {
  return { timestamp, date: '2026-01-01', close, open: close, high: close + 5, low: close - 5 }
}

const primary = [bar(1, 100), bar(2, 110), bar(3, 120), bar(4, 130)]

/** 在主品种时间轴上投影指定比较集合。 */
function project(data: ComparisonData, scrollLeft = 0, width = 100) {
  return projectComparison(primary, data, { start: 0, end: 4 }, [0, 10, 20, 30], scrollLeft, width)
}

describe('K 线原生比较投影', () => {
  it('以主品种首个可见收盘价作为共同起点，影线参与范围', () => {
    const projection = project(new Map([['B', [bar(3, 200), bar(4, 220)]]]))
    expect(projection?.basePrice).toBe(100)
    expect(projection?.min).toBe(95)
    expect(projection?.max).toBe(135)
    expect(projection?.series[0]?.points).toEqual([
      { index: 2, price: 100 },
      { index: 3, price: 110 },
    ])
  })

  it('添加顺序和比较品种首价不改变主品种基准', () => {
    const data = new Map([
      ['B', [bar(1, 200), bar(2, 500)]],
      ['A', [bar(1, 50)]],
    ])
    const before = project(data)
    const after = project(new Map([...data].reverse()))
    expect(before?.basePrice).toBe(100)
    expect(after?.basePrice).toBe(before?.basePrice)
    expect(after?.min).toBe(before?.min)
    expect(after?.max).toBe(250)
  })

  it('滚动后重新选择主品种与比较品种各自的可见首价', () => {
    const projection = project(new Map([['B', [bar(1, 50), bar(3, 200), bar(4, 300)]]]), 10, 10)
    expect(projection?.baselineIndex).toBe(1)
    expect(projection?.basePrice).toBe(110)
    expect(projection?.series[0]?.baselineClose).toBe(200)
    expect(projection?.series[0]?.points).toEqual([{ index: 2, price: 110 }])
    expect(projection?.max).toBe(125)
  })

  it('保留真实缺口并忽略主图时间轴外的比较数据', () => {
    const data = new Map([['B', [bar(0, 1), bar(1, 0), bar(2, 50), bar(4, 60), bar(5, 1000)]]])
    expect(project(data)?.series[0]?.points).toEqual([
      { index: 1, price: 100 },
      { index: 2, price: null },
      { index: 3, price: 120 },
    ])
  })

  it('没有已加载比较数据时保留主品种范围', () => {
    expect(project(new Map())?.series).toEqual([])
    expect(project(new Map())?.basePrice).toBe(100)
  })

  it('没有主品种、有效首价或可见数据时不生成投影', () => {
    const data = new Map([['B', [bar(1, 200)]]])
    expect(projectComparison([], data, { start: 0, end: 1 }, [0], 0, 100)).toBeNull()
    expect(projectComparison([bar(1, 0)], data, { start: 0, end: 1 }, [0], 0, 100)).toBeNull()
    expect(project(data, 1000)).toBeNull()
  })
})
