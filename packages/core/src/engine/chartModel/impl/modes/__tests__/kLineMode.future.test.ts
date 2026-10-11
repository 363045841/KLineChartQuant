/**
 * KLineMode 自动价格范围测试（未来时间轴 D6）。
 *
 * computePaneRange 是纯计算：可见区无真实 bar 时返回 null（由渲染端保留上一帧范围），
 * 空数据不生成任何兜底范围。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createKLineData } from '@/engine/__tests__/helpers/renderTestKit'

import {
  createTestChartDataManager,
  createTestDocument,
} from '../../../../data/__tests__/helpers/chartDataManagerTestKit'
import { KLineMode } from '../kLineMode'

describe('KLineMode 自动价格范围', () => {
  let document: Document

  beforeEach(() => {
    document = createTestDocument()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('取可见区 high/low 极值与首根基准价', () => {
    const mode = new KLineMode()
    const { manager } = createTestChartDataManager(document)
    manager.setData(createKLineData(10))

    expect(mode.computePaneRange({ start: 0, end: 10 }, manager)).toEqual({
      range: { maxPrice: 110, minPrice: 99 },
      basePrice: 100,
    })
  })

  it('纯未来区视口返回 null，由渲染端保留上一帧范围', () => {
    const mode = new KLineMode()
    const { manager } = createTestChartDataManager(document)
    manager.setData(createKLineData(10))

    expect(mode.computePaneRange({ start: 10, end: 20 }, manager)).toBeNull()
  })

  it('空数据返回 null，不生成兜底范围', () => {
    const mode = new KLineMode()
    const { manager } = createTestChartDataManager(document)

    expect(mode.computePaneRange({ start: 10, end: 20 }, manager)).toBeNull()
  })

  it('恢复有效视口后按新区间重算极值与基准价', () => {
    const mode = new KLineMode()
    const { manager } = createTestChartDataManager(document)
    manager.setData(createKLineData(10))

    // [5,10)：high 最大 data[9].high=110，low 最小 data[5].low=104，基准价=data[5].close=105
    expect(mode.computePaneRange({ start: 5, end: 10 }, manager)).toEqual({
      range: { maxPrice: 110, minPrice: 104 },
      basePrice: 105,
    })
  })
})
