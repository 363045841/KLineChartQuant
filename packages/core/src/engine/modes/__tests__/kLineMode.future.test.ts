/**
 * KLineMode 纯未来区视口的价格轴冻结测试（未来时间轴 D6）。
 *
 * 可见区间与真实数据区无交集时，
 * Pane.updateRange 必须早退保留最近一次有效 priceRange 与基准价；
 * 空数据冷启动仍走 {maxPrice:100, minPrice:0} 兜底。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { KLineData } from '@/foundation/types/price'

import {
  createTestChartDataManager,
  createTestDocument,
  MS_PER_DAY,
} from '../../data/__tests__/helpers/chartDataManagerTestKit'
import { Pane } from '../../layout/pane'
import { KLineMode } from '../impl/kLineMode'

/** 构造索引差异化的日线：high/low/close 随 i 递增，保证不同区间极值可区分。 */
function makeBar(i: number): KLineData {
  return {
    timestamp: 1_700_000_000_000 + i * MS_PER_DAY,
    open: 10 + i,
    high: 12 + i,
    low: 9 + i,
    close: 11 + i,
    volume: 1_000,
  }
}

/** 构造 n 根差异化日线。 */
function makeBars(n: number): KLineData[] {
  return Array.from({ length: n }, (_, i) => makeBar(i))
}

describe('KLineMode 纯未来区价格轴冻结', () => {
  let document: Document

  beforeEach(() => {
    document = createTestDocument()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('纯未来区视口冻结最近一次有效 priceRange 与基准价', () => {
    const pane = new Pane('main')
    const data = makeBars(10)

    // 建立有效 range：[0,10) → max=21, min=9，基准价=首根 close=11
    pane.updateRange(data, { start: 0, end: 10 })
    const frozenRange = pane.yAxis.getRange()
    const frozenBase = pane.yAxis.getBasePrice()
    // sanity：建立的不是兜底值
    expect(frozenRange).toEqual({ maxPrice: 21, minPrice: 9 })
    expect(frozenBase).toBe(11)

    // 纯未来区视口：可见区间无任何真实 bar → 冻结
    pane.updateRange(data, { start: 10, end: 20 })

    // getRange 返回内部引用：toBe 直接断言守卫期间未发生任何替换
    expect(pane.yAxis.getRange()).toBe(frozenRange)
    expect(pane.yAxis.getBasePrice()).toBe(frozenBase)
  })

  it('冻结不粘滞：恢复有效视口后 range 正常更新', () => {
    const pane = new Pane('main')
    const data = makeBars(10)

    pane.updateRange(data, { start: 0, end: 10 })
    pane.updateRange(data, { start: 10, end: 20 })

    // 恢复有效视口 [5,10)：high 最大 data[9].high=21，low 最小 data[5].low=14，基准价=data[5].close=16
    pane.updateRange(data, { start: 5, end: 10 })

    expect(pane.yAxis.getRange()).toEqual({ maxPrice: 21, minPrice: 14 })
    expect(pane.yAxis.getBasePrice()).toBe(16)
  })

  it('空数据冷启动不冻结，仍走 {100,0} 兜底', () => {
    const pane = new Pane('main')

    pane.updateRange([], { start: 10, end: 20 })

    expect(pane.yAxis.getRange()).toEqual({ maxPrice: 100, minPrice: 0 })
    expect(pane.yAxis.getBasePrice()).toBeNull()
  })

  it('经 KLineMode.updatePaneRange 委托时冻结同样生效', () => {
    const { manager } = createTestChartDataManager(document)
    const mode = new KLineMode()
    const pane = new Pane('main')
    const data = makeBars(10)
    manager.setData(data)

    mode.updatePaneRange(pane, { start: 0, end: 10 }, manager)
    const frozenRange = pane.yAxis.getRange()
    const frozenBase = pane.yAxis.getBasePrice()
    expect(frozenRange).toEqual({ maxPrice: 21, minPrice: 9 })
    // sanity：委托路径建立的不是兜底值（否则冻结断言会恒真）
    expect(frozenBase).toBe(11)

    mode.updatePaneRange(pane, { start: 10, end: 20 }, manager)

    expect(pane.yAxis.getRange()).toBe(frozenRange)
    expect(pane.yAxis.getBasePrice()).toBe(frozenBase)
  })
})
