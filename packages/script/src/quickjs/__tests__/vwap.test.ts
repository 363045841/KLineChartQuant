/** 随包 VWAP：交易日锚定重置、午休不重置、成交量不可用时留空。 */
import { describe, expect, it } from 'vitest'
import { plotValues, shippedSource } from '../../__tests__/marketData.js'
import type { ScriptValues } from '../../__tests__/marketData.js'
import type { Bar } from '../../contracts/input.js'
import { runQuickJSScript } from '../impl/runQuickJSScript.js'
import type { ScriptRequestContext } from '../../request/types.js'

/** 上海常规双段交易时段，用来区分午休与隔夜：09:30–11:30、13:00–15:00。 */
const SHANGHAI_CONTEXT: ScriptRequestContext = {
  symbol: 'TEST',
  time: {
    period: '30',
    session: {
      timeZone: 'Asia/Shanghai',
      sessions: [
        { open: 570, close: 690 },
        { open: 780, close: 900 },
      ],
    },
  },
  snapshots: [],
}

/** 上海时间 09:30 对应的 UTC 偏移分钟数（固定 UTC+8，测试不覆盖夏令时）。 */
const SHANGHAI_OFFSET_MINUTES = 8 * 60

/**
 * 构造一根 2026-01 的 bar；high/low 与 close 各差 1，使典型价恰好等于 close。
 * @param day 1 月第几天
 * @param minuteOfDay 上海当地时间，从当天 00:00 起算的分钟数
 * @param close 收盘价，同时作为典型价
 * @param volume 成交量
 * @returns 已加载行情中的一根 bar
 */
function bar(day: number, minuteOfDay: number, close: number, volume: number): Bar {
  return {
    time: Date.UTC(2026, 0, day, 0, minuteOfDay - SHANGHAI_OFFSET_MINUTES),
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume,
  }
}

/** 执行随包 VWAP 并取全部数值列。 */
async function runVwap(bars: readonly Bar[]): Promise<ScriptValues> {
  return plotValues(
    await runQuickJSScript({
      source: shippedSource('vwap'),
      bars,
      requestContext: SHANGHAI_CONTEXT,
    }),
  )
}

describe('随包 VWAP', () => {
  it('午休不重置，跨交易日开盘重置', async () => {
    const bars = [
      bar(5, 570, 10, 100),
      bar(5, 600, 11, 100),
      bar(5, 780, 12, 100),
      bar(5, 810, 13, 100),
      bar(6, 570, 20, 100),
      bar(6, 600, 30, 100),
    ]
    const values = await runVwap(bars)
    // 前四根是同一交易日的连续累加，跨过三小时午休仍不重置；第二日首根重新从 20 起算。
    expect(values.vwap).toEqual([10, 10.5, 11, 11.5, 20, 25])
    // 追加历史不改写已有前缀：锚定按交易日，与运行窗口起点无关。
    expect((await runVwap(bars.slice(0, 4))).vwap).toEqual(values.vwap?.slice(0, 4))
  })

  it('没有成交量时全程留空，不拿典型价冒充实线', async () => {
    const values = await runVwap([bar(5, 570, 10, 0), bar(5, 600, 20, 0), bar(6, 570, 30, 0)])
    expect(values.vwap).toEqual([undefined, undefined, undefined])
  })

  it('成交量从零开始出现时，从第一根有效成交量起累计', async () => {
    const values = await runVwap([bar(5, 570, 10, 0), bar(5, 600, 20, 100)])
    expect(values.vwap).toEqual([undefined, 20])
  })

  it('单根成交量缺失只让该根留空，不污染后续累加', async () => {
    const values = await runVwap([
      bar(5, 570, 10, 100),
      bar(5, 600, 20, Number.NaN),
      bar(5, 630, 30, 100),
    ])
    expect(values.vwap).toEqual([10, undefined, 20])
  })
})
