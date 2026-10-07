/** 磁吸纯函数单测：验证 weak 半径与 strong 无距离限制的 OHLC 吸附。 */
import { describe, expect, it } from 'vitest'

import {
  createMagnetSnapAdapter,
  MAGNET_PANE,
  OHLC_BARS,
} from '../../__tests__/helpers/drawingTestKit'
import { snapPointerToOhlc } from '../impl/magnetSnapper'

describe('snapPointerToOhlc', () => {
  it('weak 档吸附半径内的 high', () => {
    const adapter = createMagnetSnapAdapter()
    // x=12 → 索引 1；y=83 距该 Bar high(y=80) 3px，在 weak 半径 8px 内。
    const snapped = snapPointerToOhlc(12, 83, MAGNET_PANE, adapter, { mode: 'weak' })
    expect(snapped).toEqual({ x: 15, y: 80 })
  })

  it('weak 档吸附半径内的 low', () => {
    const adapter = createMagnetSnapAdapter()
    // y=125 距 low(y=120) 5px。
    const snapped = snapPointerToOhlc(12, 125, MAGNET_PANE, adapter, { mode: 'weak' })
    expect(snapped).toEqual({ x: 15, y: 120 })
  })

  it('weak 档不吸附 open/close（不在候选集合），但 X 仍吸附 Bar 中心', () => {
    const adapter = createMagnetSnapAdapter()
    // y=95 距 open(y=100)/close(y=90) 各 5px；若二者在 weak 候选集会被吸附改写，实际应保持 95。
    const snapped = snapPointerToOhlc(12, 95, MAGNET_PANE, adapter, { mode: 'weak' })
    expect(snapped).toEqual({ x: 15, y: 95 })
  })

  it('strong 档吸附 open/close', () => {
    const adapter = createMagnetSnapAdapter()
    // y=101 距 open(y=100) 1px。
    expect(snapPointerToOhlc(12, 101, MAGNET_PANE, adapter, { mode: 'strong' })).toEqual({
      x: 15,
      y: 100,
    })
    // y=89 距 close(y=90) 1px。
    expect(snapPointerToOhlc(12, 89, MAGNET_PANE, adapter, { mode: 'strong' })).toEqual({
      x: 15,
      y: 90,
    })
  })

  it('半径边界恰好命中（<= 比较），超界一点则保持原始 Y', () => {
    const adapter = createMagnetSnapAdapter()
    // y=88 距 high(y=80) 恰 8px，边界命中。
    expect(snapPointerToOhlc(12, 88, MAGNET_PANE, adapter, { mode: 'weak' })).toEqual({
      x: 15,
      y: 80,
    })
    // y=88.5 距 high 8.5px、距 low 31.5px，均超界，Y 保持原值。
    expect(snapPointerToOhlc(12, 88.5, MAGNET_PANE, adapter, { mode: 'weak' })).toEqual({
      x: 15,
      y: 88.5,
    })
  })

  it('strong 档即使远离所有 OHLC 也吸附最近的 low', () => {
    const adapter = createMagnetSnapAdapter()
    // y=150 距目标 Bar 所有候选（80/90/100/120）至少 30px。
    expect(snapPointerToOhlc(12, 150, MAGNET_PANE, adapter, { mode: 'strong' })).toEqual({
      x: 15,
      y: 120,
    })
  })

  it('夹取越界逻辑索引到有效 Bar 范围', () => {
    const adapter = createMagnetSnapAdapter()
    // x=999 解析为索引 99，越界夹取到索引 2（high=220 → y=-20）；点击 y=-19 距 1px。
    const snapped = snapPointerToOhlc(999, -19, MAGNET_PANE, adapter, { mode: 'weak' })
    expect(snapped).toEqual({ x: 25, y: -20 })
  })

  it('无数据时返回 null', () => {
    const adapter = createMagnetSnapAdapter([])
    expect(snapPointerToOhlc(12, 83, MAGNET_PANE, adapter, { mode: 'weak' })).toBeNull()
  })

  it('索引不可解析时返回 null', () => {
    const adapter = createMagnetSnapAdapter(OHLC_BARS, { getLogicalIndexAtX: () => null })
    expect(snapPointerToOhlc(12, 83, MAGNET_PANE, adapter, { mode: 'weak' })).toBeNull()
  })

  it('weak 档 Bar 中心与 Y 均无吸附点时返回 null', () => {
    const adapter = createMagnetSnapAdapter(OHLC_BARS, { getXAtLogicalIndex: () => null })
    // Y 距 high/low 超过 8px 且 X 中心不可解析 → 整体 null。
    expect(snapPointerToOhlc(12, 150, MAGNET_PANE, adapter, { mode: 'weak' })).toBeNull()
    expect(snapPointerToOhlc(12, 150, MAGNET_PANE, adapter, { mode: 'strong' })).toEqual({
      x: 12,
      y: 120,
    })
  })

  it('Y 命中但 Bar 中心不可解析时只吸附 Y', () => {
    const adapter = createMagnetSnapAdapter(OHLC_BARS, { getXAtLogicalIndex: () => null })
    expect(snapPointerToOhlc(12, 83, MAGNET_PANE, adapter, { mode: 'weak' })).toEqual({
      x: 12,
      y: 80,
    })
  })

  it('Pane 顶部偏移参与 Y 换算（吸附结果为容器局部坐标）', () => {
    const adapter = createMagnetSnapAdapter()
    const pane = { paneId: 'sub', top: 40, height: 160 }
    // 容器局部 y=123 → pane 局部 83，距 high(pane 局部 80) 3px，吸附后容器局部 y=40+80=120。
    const snapped = snapPointerToOhlc(12, 123, pane, adapter, { mode: 'weak' })
    expect(snapped).toEqual({ x: 15, y: 120 })
  })
})
