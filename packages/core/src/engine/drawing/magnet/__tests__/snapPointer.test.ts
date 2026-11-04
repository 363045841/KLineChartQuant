/**
 * 磁吸纯函数单测：候选采集（OHLC / 图元线 / 指标值）、档位半径、同距离定序与排除自身。
 *
 * 夹具坐标：Bar i 占 [i*10, i*10+10)，中心 x=i*10+5；价格↔Y 为 y = 200 - price。
 * 目标 Bar（索引 1）：open=100 high=120 low=80 close=110 → y：high=80 low=120 open=100 close=90。
 */
import { describe, expect, it } from 'vitest'

import {
  createMagnetConfig,
  createMagnetSnapAdapter,
  MAGNET_PANE,
  OHLC_BARS,
} from '../../__tests__/helpers/drawingTestKit'
import { snapPointer } from '../impl/snapPointer'

describe('snapPointer', () => {
  it('weak 档吸附半径内的 high，X 落 Bar 中心', () => {
    const snapped = snapPointer(
      12,
      83,
      MAGNET_PANE,
      createMagnetSnapAdapter(),
      createMagnetConfig('weak'),
    )
    expect(snapped).toMatchObject({ x: 15, y: 80 })
    expect(snapped?.candidate).toMatchObject({ price: 120, source: 'bar' })
  })

  it('weak 档同样吸附 open/close，只是限定半径', () => {
    // y=95 距 open(y=100) 与 close(y=90) 各 5px；同距离按稳定 id 取 close。
    const snapped = snapPointer(
      12,
      95,
      MAGNET_PANE,
      createMagnetSnapAdapter(),
      createMagnetConfig('weak'),
    )
    expect(snapped).toMatchObject({ x: 15, y: 90, candidate: { price: 110 } })
  })

  it('weak 档恰好在半径边界命中，全部候选超界则不吸', () => {
    const adapter = createMagnetSnapAdapter()
    // y=72 距 high(y=80) 恰 8px，其余 OHLC 值都更远。
    expect(snapPointer(12, 72, MAGNET_PANE, adapter, createMagnetConfig('weak'))?.y).toBe(80)
    // y=71.5 距 high 8.5px，其余候选更远，Y 保持原值。
    expect(
      snapPointer(12, 71.5, MAGNET_PANE, adapter, createMagnetConfig('weak'))?.candidate,
    ).toBeNull()
  })

  it('strong 档半径更大：weak 超界的落点仍吸附，超出 strong 半径则自由落点', () => {
    const adapter = createMagnetSnapAdapter()
    // y=140 距 low(y=120) 20px：weak 超界，strong 命中。
    expect(
      snapPointer(12, 140, MAGNET_PANE, adapter, createMagnetConfig('weak'))?.candidate,
    ).toBeNull()
    expect(
      snapPointer(12, 140, MAGNET_PANE, adapter, createMagnetConfig('strong'))?.candidate?.price,
    ).toBe(80)
    // y=150 距 low 30px，超出 strong 半径。
    expect(
      snapPointer(12, 150, MAGNET_PANE, adapter, createMagnetConfig('strong'))?.candidate,
    ).toBeNull()
  })

  it('图元线按 Bar 中心求交：命中价格精确等于该线在 X 处的值', () => {
    const config = createMagnetConfig('weak', {
      lines: [{ drawingId: 'h1', a: { x: 0, y: 60 }, b: { x: 100, y: 60 } }],
    })
    const snapped = snapPointer(12, 62, MAGNET_PANE, createMagnetSnapAdapter(), config)
    expect(snapped?.candidate).toMatchObject({ price: 140, source: 'drawing', time: null })
    expect(snapped).toMatchObject({ x: 15, y: 60 })
  })

  it('图元线在 Bar 中心 X 之外不参与候选', () => {
    const config = createMagnetConfig('weak', {
      lines: [{ drawingId: 'h1', a: { x: 0, y: 60 }, b: { x: 10, y: 60 } }],
    })
    const snapped = snapPointer(12, 62, MAGNET_PANE, createMagnetSnapAdapter(), config)
    expect(snapped?.candidate).toBeNull()
  })

  it('图元线与 OHLC 同时可吸时取更近者', () => {
    const config = createMagnetConfig('weak', {
      lines: [{ drawingId: 'h1', a: { x: 0, y: 84 }, b: { x: 100, y: 84 } }],
    })
    const snapped = snapPointer(12, 86, MAGNET_PANE, createMagnetSnapAdapter(), config)
    expect(snapped?.candidate?.price).toBe(116)
  })

  it('水平线段写回领域价格原值，不经屏幕反算', () => {
    // yToPrice 故意返回不相干的值：若走反算就会命中它。
    const adapter = createMagnetSnapAdapter(OHLC_BARS, {
      priceToY: () => 61.7,
      yToPrice: () => 999,
    })
    const config = createMagnetConfig('weak', {
      lines: [{ drawingId: 'h1', a: { x: 0, y: 61.7 }, b: { x: 100, y: 61.7 }, price: 123.45 }],
    })
    expect(snapPointer(12, 62, MAGNET_PANE, adapter, config)?.candidate?.price).toBe(123.45)
  })

  it('指标值参与候选；同距离时优先于 OHLC', () => {
    const config = createMagnetConfig('strong', {
      indicatorValues: [{ id: 'ma:1', value: 120 }],
    })
    const snapped = snapPointer(12, 80, MAGNET_PANE, createMagnetSnapAdapter(), config)
    expect(snapped?.candidate).toMatchObject({ source: 'indicator', price: 120 })
  })

  it('排除正在拖拽的图元，不回落到它自己的线', () => {
    const lines = [{ drawingId: 'dragging', a: { x: 0, y: 60 }, b: { x: 100, y: 60 } }]
    const adapter = createMagnetSnapAdapter()
    const included = snapPointer(
      12,
      62,
      MAGNET_PANE,
      adapter,
      createMagnetConfig('weak', { lines }),
    )
    expect(included?.candidate?.price).toBe(140)

    const excluded = snapPointer(
      12,
      62,
      MAGNET_PANE,
      adapter,
      createMagnetConfig('weak', { lines, excludeDrawingIds: ['dragging'] }),
    )
    expect(excluded?.candidate).toBeNull()
  })

  it('全部坐标是 Pane 局部：pane.top 不再参与任何换算', () => {
    const pane = { paneId: 'main', top: 40, height: 200 }
    const snapped = snapPointer(12, 83, pane, createMagnetSnapAdapter(), createMagnetConfig('weak'))
    expect(snapped).toMatchObject({ x: 15, y: 80 })
  })

  it('Bar 中心不可解析时保持指针 X，未命中候选则只有 X 可用', () => {
    const adapter = createMagnetSnapAdapter(OHLC_BARS, { getXAtLogicalIndex: () => null })
    const snapped = snapPointer(12, 83, MAGNET_PANE, adapter, createMagnetConfig('weak'))
    expect(snapped).toMatchObject({ x: 12, y: 80 })

    const noCandidate = snapPointer(12, 70, MAGNET_PANE, adapter, createMagnetConfig('weak'))
    expect(noCandidate).toBeNull()
  })

  it('无数据或索引不可解析时返回 null', () => {
    expect(
      snapPointer(12, 83, MAGNET_PANE, createMagnetSnapAdapter([]), createMagnetConfig('weak')),
    ).toBeNull()
    const unparsable = createMagnetSnapAdapter(OHLC_BARS, { getLogicalIndexAtX: () => null })
    expect(snapPointer(12, 83, MAGNET_PANE, unparsable, createMagnetConfig('weak'))).toBeNull()
  })
})
