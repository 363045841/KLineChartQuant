/** 磁吸纯函数单测：验证 weak/strong 档位的候选集合、半径边界与 Bar 中心吸附。 */
import { describe, expect, it } from 'vitest'

import {
  snapPointerToOhlc,
  MAGNET_RADIUS_WEAK,
  MAGNET_RADIUS_STRONG,
} from '../magnetSnapper'
import { createMagnetSnapAdapter, OHLC_BARS } from './helpers/drawingTestKit'

const PANE = { paneId: 'main', top: 0, height: 200 }

describe('snapPointerToOhlc', () => {
  it('weak 档吸附半径内的 high', () => {
    const adapter = createMagnetSnapAdapter(OHLC_BARS)
    // x=12 → 索引 1；y=83 距该 Bar high(y=80) 3px，在 weak 半径 8px 内。
    const snapped = snapPointerToOhlc(12, 83, PANE, adapter, { mode: 'weak' })
    expect(snapped).toEqual({ x: 15, y: 80 })
  })

  it('weak 档吸附半径内的 low', () => {
    const adapter = createMagnetSnapAdapter(OHLC_BARS)
    // y=125 距 low(y=120) 5px。
    const snapped = snapPointerToOhlc(12, 125, PANE, adapter, { mode: 'weak' })
    expect(snapped).toEqual({ x: 15, y: 120 })
  })

  it('weak 档不吸附 open/close（不在候选集合），但 X 仍吸附 Bar 中心', () => {
    const adapter = createMagnetSnapAdapter(OHLC_BARS)
    // y=100 恰为目标 Bar open 的屏幕位置，距 high/low 均 20px，超出 weak 半径。
    const snapped = snapPointerToOhlc(12, 100, PANE, adapter, { mode: 'weak' })
    expect(snapped).toEqual({ x: 15, y: 100 })
  })

  it('strong 档吸附半径内的 open/close', () => {
    const adapter = createMagnetSnapAdapter(OHLC_BARS)
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
    const adapter = createMagnetSnapAdapter(OHLC_BARS)
    // y=88 距 high(y=80) 恰 8px，边界命中。
    expect(snapPointerToOhlc(12, 88, PANE, adapter, { mode: 'weak' })).toEqual({ x: 15, y: 80 })
    // y=88.5 距 high 8.5px、距 low 31.5px，均超界，Y 保持原值。
    expect(snapPointerToOhlc(12, 88.5, PANE, adapter, { mode: 'weak' })).toEqual({
      x: 15,
      y: 88.5,
    })
  })

  it('所有候选都超出半径时 Y 保持原始、X 仍吸附 Bar 中心', () => {
    const adapter = createMagnetSnapAdapter(OHLC_BARS)
    // y=150 距目标 Bar 所有候选（80/90/100/120）均超过 strong 半径 15px。
    expect(snapPointerToOhlc(12, 150, PANE, adapter, { mode: 'strong' })).toEqual({
      x: 15,
      y: 150,
    })
  })

  it('夹取越界逻辑索引到有效 Bar 范围', () => {
    const adapter = createMagnetSnapAdapter(OHLC_BARS)
    // x=999 解析为索引 99，越界夹取到索引 2（high=220 → y=-20）；点击 y=-19 距 1px。
    const snapped = snapPointerToOhlc(999, -19, PANE, adapter, { mode: 'weak' })
    expect(snapped).toEqual({ x: 25, y: -20 })
  })

  it('无数据时返回 null', () => {
    const adapter = createMagnetSnapAdapter([])
    expect(snapPointerToOhlc(12, 83, PANE, adapter, { mode: 'weak' })).toBeNull()
  })

  it('索引不可解析时返回 null', () => {
    const adapter = {
      ...createMagnetSnapAdapter(OHLC_BARS),
      getLogicalIndexAtX: () => null,
    }
    expect(snapPointerToOhlc(12, 83, PANE, adapter, { mode: 'weak' })).toBeNull()
  })

  it('Bar 中心与 Y 均无吸附点时返回 null', () => {
    const adapter = {
      ...createMagnetSnapAdapter(OHLC_BARS),
      getScreenXAtLogicalIndex: () => null,
    }
    // Y 距所有候选超半径且 X 中心不可解析 → 整体 null。
    expect(snapPointerToOhlc(12, 150, PANE, adapter, { mode: 'strong' })).toBeNull()
  })

  it('Y 命中但 Bar 中心不可解析时只吸附 Y', () => {
    const adapter = {
      ...createMagnetSnapAdapter(OHLC_BARS),
      getScreenXAtLogicalIndex: () => null,
    }
    expect(snapPointerToOhlc(12, 83, PANE, adapter, { mode: 'weak' })).toEqual({
      x: 12,
      y: 80,
    })
  })

  it('Pane 顶部偏移参与 Y 换算（吸附结果为容器局部坐标）', () => {
    const adapter = createMagnetSnapAdapter(OHLC_BARS)
    const pane = { paneId: 'sub', top: 40, height: 160 }
    // 容器局部 y=123 → pane 局部 83，距 high(pane 局部 80) 3px，吸附后容器局部 y=40+80=120。
    const snapped = snapPointerToOhlc(12, 123, pane, adapter, { mode: 'weak' })
    expect(snapped).toEqual({ x: 15, y: 120 })
  })
})
