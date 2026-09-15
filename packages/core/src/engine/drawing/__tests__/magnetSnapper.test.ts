/** 磁吸纯函数单测：验证 weak/strong 档位的候选集合、半径边界与 Bar 中心吸附。 */
import { describe, expect, it } from 'vitest'

import type { DrawingChartAdapter } from '../../../controllers/types'
import {
  snapPointerToOhlc,
  MAGNET_RADIUS_WEAK,
  MAGNET_RADIUS_STRONG,
} from '../magnetSnapper'

/** 价格→Y 线性映射：y = 200 - price（价格越高越靠上）。 */
const priceToY = (_paneId: string, price: number) => 200 - price

/**
 * 三根 Bar 的 OHLC 数据：索引 1 为目标 Bar（open=100 high=120 low=80 close=110），
 * 屏幕 y：high=80 low=120 open=100 close=90；相邻 Bar 取远离目标的价格避免歧义。
 */
const BARS = [
  { open: 50, high: 60, low: 40, close: 55 },
  { open: 100, high: 120, low: 80, close: 110 },
  { open: 200, high: 220, low: 180, close: 210 },
]

/** 构造带 OHLC 数据与索引换算的最小 adapter（Bar i 占 [i*10, i*10+10)，中心 i*10+5）。 */
function createAdapter(bars: Array<{ open: number; high: number; low: number; close: number }>) {
  return {
    getData: () => bars,
    getLogicalIndexAtX: (x: number) => Math.floor(x / 10),
    getScreenXAtLogicalIndex: (index: number) => index * 10 + 5,
    priceToY,
  } as unknown as DrawingChartAdapter
}

const PANE = { paneId: 'main', top: 0, height: 200 }

describe('snapPointerToOhlc', () => {
  it('weak 档吸附半径内的 high', () => {
    const adapter = createAdapter(BARS)
    // x=12 → 索引 1；y=83 距该 Bar high(y=80) 3px，在 weak 半径 8px 内。
    const snapped = snapPointerToOhlc(12, 83, PANE, adapter, { mode: 'weak' })
    expect(snapped).toEqual({ x: 15, y: 80 })
  })

  it('weak 档吸附半径内的 low', () => {
    const adapter = createAdapter(BARS)
    // y=125 距 low(y=120) 5px。
    const snapped = snapPointerToOhlc(12, 125, PANE, adapter, { mode: 'weak' })
    expect(snapped).toEqual({ x: 15, y: 120 })
  })

  it('weak 档不吸附 open/close（不在候选集合），但 X 仍吸附 Bar 中心', () => {
    const adapter = createAdapter(BARS)
    // y=100 恰为目标 Bar open 的屏幕位置，距 high/low 均 20px，超出 weak 半径。
    const snapped = snapPointerToOhlc(12, 100, PANE, adapter, { mode: 'weak' })
    expect(snapped).toEqual({ x: 15, y: 100 })
  })

  it('strong 档吸附半径内的 open/close', () => {
    const adapter = createAdapter(BARS)
    // y=101 距 open(y=100) 1px。
    expect(snapPointerToOhlc(12, 101, PANE, adapter, { mode: 'strong' })).toEqual({
      x: 15,
      y: 100,
    })
    // y=89 距 close(y=90) 1px。
    expect(snapPointerToOhlc(12, 89, PANE, adapter, { mode: 'strong' })).toEqual({
      x: 15,
      y: 90,
    })
  })

  it('strong 半径（15px）大于 weak 半径（8px）', () => {
    expect(MAGNET_RADIUS_STRONG).toBe(15)
    expect(MAGNET_RADIUS_WEAK).toBe(8)
  })

  it('半径边界恰好命中（<= 比较），超界一点则保持原始 Y', () => {
    const adapter = createAdapter(BARS)
    // y=88 距 high(y=80) 恰 8px，边界命中。
    expect(snapPointerToOhlc(12, 88, PANE, adapter, { mode: 'weak' })).toEqual({ x: 15, y: 80 })
    // y=88.5 距 high 8.5px、距 low 31.5px，均超界，Y 保持原值。
    expect(snapPointerToOhlc(12, 88.5, PANE, adapter, { mode: 'weak' })).toEqual({
      x: 15,
      y: 88.5,
    })
  })

  it('所有候选都超出半径时 Y 保持原始、X 仍吸附 Bar 中心', () => {
    const adapter = createAdapter(BARS)
    // y=150 距目标 Bar 所有候选（80/90/100/120）均超过 strong 半径 15px。
    expect(snapPointerToOhlc(12, 150, PANE, adapter, { mode: 'strong' })).toEqual({
      x: 15,
      y: 150,
    })
  })

  it('夹取越界逻辑索引到有效 Bar 范围', () => {
    const adapter = createAdapter(BARS)
    // x=999 解析为索引 99，越界夹取到索引 2（high=220 → y=-20）；点击 y=-19 距 1px。
    const snapped = snapPointerToOhlc(999, -19, PANE, adapter, { mode: 'weak' })
    expect(snapped).toEqual({ x: 25, y: -20 })
  })

  it('无数据时返回 null', () => {
    const adapter = createAdapter([])
    expect(snapPointerToOhlc(12, 83, PANE, adapter, { mode: 'weak' })).toBeNull()
  })

  it('索引不可解析时返回 null', () => {
    const adapter = {
      ...createAdapter(BARS),
      getLogicalIndexAtX: () => null,
    } as unknown as DrawingChartAdapter
    expect(snapPointerToOhlc(12, 83, PANE, adapter, { mode: 'weak' })).toBeNull()
  })

  it('Bar 中心与 Y 均无吸附点时返回 null', () => {
    const adapter = {
      ...createAdapter(BARS),
      getScreenXAtLogicalIndex: () => null,
    } as unknown as DrawingChartAdapter
    // Y 距所有候选超半径且 X 中心不可解析 → 整体 null。
    expect(snapPointerToOhlc(12, 150, PANE, adapter, { mode: 'strong' })).toBeNull()
  })

  it('Y 命中但 Bar 中心不可解析时只吸附 Y', () => {
    const adapter = {
      ...createAdapter(BARS),
      getScreenXAtLogicalIndex: () => null,
    } as unknown as DrawingChartAdapter
    expect(snapPointerToOhlc(12, 83, PANE, adapter, { mode: 'weak' })).toEqual({
      x: 12,
      y: 80,
    })
  })

  it('Pane 顶部偏移参与 Y 换算（吸附结果为容器局部坐标）', () => {
    const adapter = createAdapter(BARS)
    const pane = { paneId: 'sub', top: 40, height: 160 }
    // 容器局部 y=123 → pane 局部 83，距 high(pane 局部 80) 3px，吸附后容器局部 y=40+80=120。
    const snapped = snapPointerToOhlc(12, 123, pane, adapter, { mode: 'weak' })
    expect(snapped).toEqual({ x: 15, y: 120 })
  })
})
