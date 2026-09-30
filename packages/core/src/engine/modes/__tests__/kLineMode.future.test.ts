/**
 * KLineMode 纯未来区视口的价格轴冻结测试（未来时间轴 D6）。
 *
 * 可见区间与真实数据区无交集时，
 * Pane.updateRange 必须早退保留最近一次有效 priceRange 与基准价；
 * 空数据冷启动仍走 {maxPrice:100, minPrice:0} 兜底。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createKLineData } from '@/engine/__tests__/helpers/renderTestKit'

import {
  createTestChartDataManager,
  createTestDocument,
} from '../../data/__tests__/helpers/chartDataManagerTestKit'
import { Pane } from '../../layout/pane'
import { KLineMode } from '../impl/kLineMode'

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
    const data = createKLineData(10)

    // 建立有效 range：[0,10) → max=110, min=99，基准价=首根 close=100
    pane.updateRange(data, { start: 0, end: 10 })
    const frozenRange = pane.yAxis.getRange()
    const frozenBase = pane.yAxis.getBasePrice()
    // sanity：建立的不是兜底值
    expect(frozenRange).toEqual({ maxPrice: 110, minPrice: 99 })
    expect(frozenBase).toBe(100)

    // 纯未来区视口：可见区间无任何真实 bar → 冻结
    pane.updateRange(data, { start: 10, end: 20 })

    // getRange 返回内部引用：toBe 直接断言守卫期间未发生任何替换
    expect(pane.yAxis.getRange()).toBe(frozenRange)
    expect(pane.yAxis.getBasePrice()).toBe(frozenBase)
  })

  it('冻结不粘滞：恢复有效视口后 range 正常更新', () => {
    const pane = new Pane('main')
    const data = createKLineData(10)

    pane.updateRange(data, { start: 0, end: 10 })
    pane.updateRange(data, { start: 10, end: 20 })

    // 恢复有效视口 [5,10)：high 最大 data[9].high=110，low 最小 data[5].low=104，基准价=data[5].close=105
    pane.updateRange(data, { start: 5, end: 10 })

    expect(pane.yAxis.getRange()).toEqual({ maxPrice: 110, minPrice: 104 })
    expect(pane.yAxis.getBasePrice()).toBe(105)
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
    const data = createKLineData(10)
    manager.setData(data)

    mode.updatePaneRange(pane, { start: 0, end: 10 }, manager)
    const frozenRange = pane.yAxis.getRange()
    const frozenBase = pane.yAxis.getBasePrice()
    expect(frozenRange).toEqual({ maxPrice: 110, minPrice: 99 })
    // sanity：委托路径建立的不是兜底值（否则冻结断言会恒真）
    expect(frozenBase).toBe(100)

    mode.updatePaneRange(pane, { start: 10, end: 20 }, manager)

    expect(pane.yAxis.getRange()).toBe(frozenRange)
    expect(pane.yAxis.getBasePrice()).toBe(frozenBase)
  })
})
