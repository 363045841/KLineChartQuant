/** 随包 CVD：有主动买量时精确、没有时估算，两者不混用；缺量或一字板只让当根留空。 */
import { describe, expect, it } from 'vitest'
import type { ScriptValues } from '../../__tests__/marketData.js'
import { plotValues, shippedSource } from '../../__tests__/marketData.js'
import type { Bar } from '../../contracts/input.js'
import type { ScriptRequestContext } from '../../request/types.js'
import { runQuickJSScript } from '../impl/runQuickJSScript.js'

/** 上海时间 09:30 对应的 UTC 偏移分钟数（固定 UTC+8，测试不覆盖夏令时）。 */
const SHANGHAI_OFFSET_MINUTES = 8 * 60

/** 简化的交易日上下文，只用来驱动每日重置。 */
const CONTEXT: ScriptRequestContext = {
  symbol: 'TEST',
  time: {
    period: '1',
    session: {
      timeZone: 'Asia/Shanghai',
      sessions: [{ open: 570, close: 900 }],
    },
  },
  snapshots: [],
}

/**
 * 构造一根 bar。
 *
 * @param minuteOfDay 上海当地时间，从当天 00:00 起算的分钟数
 * @param volume 成交量
 * @param buyVolume 主动买入量；省略表示数据源不分主动方向
 * @returns 已加载行情中的一根 bar
 */
function bar(minuteOfDay: number, volume: number, buyVolume?: number): Bar {
  const base: Bar = {
    time: Date.UTC(2026, 0, 5, 0, minuteOfDay - SHANGHAI_OFFSET_MINUTES),
    open: 10,
    high: 11,
    low: 9,
    close: 10.5,
    volume,
  }
  return buyVolume === undefined ? base : { ...base, buyVolume }
}

/** 执行随包 CVD 并取全部数值列。 */
async function runCvd(bars: readonly Bar[]): Promise<ScriptValues> {
  return plotValues(
    await runQuickJSScript({ source: shippedSource('cvd'), bars, requestContext: CONTEXT }),
  )
}

describe('随包 CVD', () => {
  it('有主动买量时用精确口径：净差 = 2 × 主动买 − 总量', async () => {
    // 量 100、主动买 70 → 主动卖 30 → 净差 +40
    const values = await runCvd([bar(570, 100, 70), bar(571, 200, 100)])

    expect(values.delta).toEqual([40, 0])
    expect(values.cvd).toEqual([40, 40])
  })

  it('没有主动买量时按收盘位置估算，方向随收盘偏向变化', async () => {
    // close 落在区间偏上（10.5 位于 9–11 的中点偏上），估算净差为正
    const values = await runCvd([bar(570, 100)])

    expect(values.delta?.[0]).toBeGreaterThan(0)
    expect(values.cvd?.[0]).toBe(values.delta?.[0])
  })

  it('一字板没有方向时当根留空，累计值不变', async () => {
    const flat: Bar = {
      time: Date.UTC(2026, 0, 5, 0, 570 - SHANGHAI_OFFSET_MINUTES),
      open: 10,
      high: 10,
      low: 10,
      close: 10,
      volume: 100,
    }
    const values = await runCvd([bar(569, 100, 70), flat])

    expect(values.cvd).toEqual([40, undefined])
  })
})
