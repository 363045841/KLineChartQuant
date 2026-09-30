/**
 * viewport 未来时间轴（future time axis）纯函数层测试。
 *
 * 覆盖：
 * - computeMaxScrollLeftWithVisibleData 的未来区滚动上限（future 选项）
 * - getVisibleRange 允许 end 超出 totalDataCount（未来槽位索引）
 *
 * 数值基准：dpr=1, kWidth=9, kGap=1 → unitPx=10, startXPx=kGapPx=1（无左缓冲时）。
 */
import { describe, expect, it } from 'vitest'
import {
  computeMaxScrollLeftWithVisibleData,
  DEFAULT_FUTURE_SCREENS,
  getVisibleRange,
} from '../viewport.js'

describe('computeMaxScrollLeftWithVisibleData future space', () => {
  // 公共参数：100 根数据，kWidth=9, kGap=1, dpr=1 → unitPx=10, startXPx=1
  it.each([
    {
      name: '不传 futureScreens 时使用 DEFAULT_FUTURE_SCREENS',
      futureScreens: undefined,
      // futureBars = 100 * DEFAULT_FUTURE_SCREENS → rawMax = 1 + (99 + futureBars) * 10
      expected: 1 + (99 + 100 * DEFAULT_FUTURE_SCREENS) * 10,
    },
    {
      name: '不传 future 选项时保持旧行为',
      futureScreens: null, // null 表示整体不传 future 选项
      expected: 991, // rawMax = 1 + 99 * 10
    },
  ])('$name', ({ futureScreens, expected }) => {
    const max = computeMaxScrollLeftWithVisibleData(
      100_000, // contentMaxScrollLeft 足够大，不成为瓶颈
      0, // leftLoadBufferWidth
      9, // kWidth
      1, // kGap
      100, // totalDataCount
      1, // dpr
      futureScreens === null ? undefined : { plotWidth: 1000, futureScreens },
    )
    expect(max).toBe(expected)
  })

  it('dpr=2 时未来区槽位按物理像素换算', () => {
    // dpr=2: kWidthPx=17, kGapPx=2 → unitPx=19, startXPx=2
    // futureBars = ceil(1000*2/19)=106，lastBarIndex=99+106=205
    // rawMax=(2+205*19)/2=1948.5，吸附后 3895/19=205 整除 → 仍为 1948.5
    const max = computeMaxScrollLeftWithVisibleData(100_000, 0, 9, 1, 100, 2, {
      plotWidth: 1000,
      futureScreens: 1,
    })
    expect(max).toBe(1948.5)
  })
})

describe('getVisibleRange future end', () => {
  it('end 可超出 totalDataCount（未来槽位）', () => {
    // scrollLeft=1500：end = ceil((1500 + 1000 - 1) / 10) + 1 = 251，远超 100 根数据
    const range = getVisibleRange(1500, 1000, 9, 1, 100, 1)
    expect(range.end).toBe(251)
    expect(range.start).toBe(148)
  })

  it('视口未滚入未来区时 end 仍覆盖到数据尾部', () => {
    // scrollLeft=0：end = ceil((0 + 1000 - 1) / 10) + 1 = 101，正常扩窗行为不受影响
    const range = getVisibleRange(0, 1000, 9, 1, 100, 1)
    expect(range.end).toBe(101)
  })
})
