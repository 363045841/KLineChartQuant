/**
 * 面板重建测试：官方聚合与自算周期的合并规则。
 *
 * 这里最容易出的错是「把覆盖不足的窗口当成完整周期」——它不会报错，
 * 只会让面板上的 1h 数字实际来自 20 分钟样本。
 */
import { describe, expect, it } from 'vitest'
import { HOUR_MS } from '../orderflow/impl/largeOrderAccumulator'
import { reassemblePanel } from '../orderflow/impl/reassemble'
import type { FlowMinuteRecord, FlowRecord } from '../orderflow/types'

/** 一分钟的毫秒数。 */
const MINUTE_MS = 60_000

/** 一个整点时刻（由常量取整得到，避免手写数字不是整点）。 */
const HOUR = Math.floor(1_794_410_400_000 / HOUR_MS) * HOUR_MS

/** 快照时刻：刚过整点，最后一个已结束的分钟是 `HOUR + 59m`。 */
const NOW = HOUR + HOUR_MS + 10_000

/**
 * 构造一条单分钟记录。
 *
 * @param minuteStart 分钟起点
 * @param buy 主动买入金额
 * @param sell 主动卖出金额
 * @returns 分钟记录
 */
function minuteRow(minuteStart: number, buy: number, sell: number): FlowMinuteRecord {
  return {
    schemaVersion: 1,
    venue: 'bybit',
    symbol: 'BTCUSDT',
    minuteStart,
    buy,
    sell,
    trades: 10,
    coverage: 'sampled',
  }
}

/**
 * 构造最近若干个已结束分钟。
 *
 * @param count 分钟数
 * @returns 分钟记录，按时间升序
 */
function recentMinutes(count: number): FlowMinuteRecord[] {
  const rows: FlowMinuteRecord[] = []
  for (let index = count; index >= 1; index -= 1) {
    rows.push(minuteRow(HOUR + HOUR_MS - index * MINUTE_MS, 60, 40))
  }
  return rows
}

/**
 * 构造一条落盘成交记录。
 *
 * @param granularity 数据粒度
 * @returns 成交记录
 */
function flowRecord(granularity: FlowRecord['granularity']): FlowRecord {
  return {
    schemaVersion: 1,
    venue: 'bybit',
    symbol: 'BTCUSDT',
    windowSeconds: 3600,
    timestamp: HOUR,
    takerBuyNotional: 900,
    takerSellNotional: 100,
    takerBuyRatio: 0.9,
    netNotional: 800,
    coverageSeconds: 3600,
    granularity,
  }
}

describe('reassemblePanel 的 CVD 曲线', () => {
  it('按连续分钟累加净额，累计值从这段窗口起点算起', () => {
    const panel = reassemblePanel(
      {
        symbol: 'BTCUSDT',
        depth: [],
        flow: [],
        flowMinutes: recentMinutes(3),
        positioning: [],
        largeOrders: [],
      },
      ['bybit'],
      NOW,
    )
    const cvd = panel.venues[0]?.cvd ?? []

    expect(cvd).toHaveLength(3)
    // 每分钟买 60 卖 40，净额 +20，累计 20 / 40 / 60
    expect(cvd.map((point) => point.delta)).toEqual([20, 20, 20])
    expect(cvd.map((point) => point.cumulative)).toEqual([20, 40, 60])
    expect(cvd[2]?.minuteStart).toBe(HOUR + HOUR_MS - MINUTE_MS)
  })

  it('遇到缺口就断开重算，不跨缺口连线', () => {
    const rows = recentMinutes(4)
    // 抹掉倒数第二分钟，最后两分钟不连续
    const withGap = rows.filter((row) => row.minuteStart !== HOUR + HOUR_MS - 2 * MINUTE_MS)
    const panel = reassemblePanel(
      {
        symbol: 'BTCUSDT',
        depth: [],
        flow: [],
        flowMinutes: withGap,
        positioning: [],
        largeOrders: [],
      },
      ['bybit'],
      NOW,
    )
    const cvd = panel.venues[0]?.cvd ?? []

    // 只剩最后那一分钟，累计值也重新起算
    expect(cvd).toHaveLength(1)
    expect(cvd[0]?.cumulative).toBe(20)
  })

  it('落盘晚一分钟时仍出曲线，锚点取不晚于上一个已结束分钟的最新一行', () => {
    // 最新一行是两分钟前：上一个已结束分钟还没写，不应把整条曲线清空
    const rows = recentMinutes(4).filter((row) => row.minuteStart !== HOUR + HOUR_MS - MINUTE_MS)
    const panel = reassemblePanel(
      {
        symbol: 'BTCUSDT',
        depth: [],
        flow: [],
        flowMinutes: rows,
        positioning: [],
        largeOrders: [],
      },
      ['bybit'],
      NOW,
    )

    expect(panel.venues[0]?.cvd).toHaveLength(3)
  })

  it('最新一分钟落后太多时整条作废，不把旧数据当现在', () => {
    const rows = recentMinutes(3).map((row) => ({
      ...row,
      minuteStart: row.minuteStart - 10 * MINUTE_MS,
    }))
    const panel = reassemblePanel(
      {
        symbol: 'BTCUSDT',
        depth: [],
        flow: [],
        flowMinutes: rows,
        positioning: [],
        largeOrders: [],
      },
      ['bybit'],
      NOW,
    )

    expect(panel.venues[0]?.cvd).toEqual([])
  })

  it('没有分钟记录时为空数组，不伪造曲线', () => {
    const panel = reassemblePanel(
      {
        symbol: 'BTCUSDT',
        depth: [],
        flow: [],
        flowMinutes: [],
        positioning: [],
        largeOrders: [],
      },
      ['bybit'],
      NOW,
    )

    expect(panel.venues[0]?.cvd).toEqual([])
  })
})

describe('reassemblePanel 的周期聚合', () => {
  it('满 60 分钟才给 1h，覆盖秒数等于周期', () => {
    const panel = reassemblePanel(
      {
        symbol: 'BTCUSDT',
        depth: [],
        flow: [],
        flowMinutes: recentMinutes(60),
        positioning: [],
        largeOrders: [],
      },
      ['bybit'],
      NOW,
    )
    const flows = panel.venues[0].flows
    expect(flows.map((flow) => flow.windowSeconds)).toEqual([3600, 900, 300, 60])
    expect(flows[0].coverageSeconds).toBe(3600)
    expect(flows[0].takerBuyRatio).toBeCloseTo(0.6, 6)
    expect(flows[0].granularity).toBe('self-aggregated')
  })

  it('只有 20 分钟数据时 1h 只报覆盖 1200 秒', () => {
    const panel = reassemblePanel(
      {
        symbol: 'BTCUSDT',
        depth: [],
        flow: [],
        flowMinutes: recentMinutes(20),
        positioning: [],
        largeOrders: [],
      },
      ['bybit'],
      NOW,
    )
    const flows = panel.venues[0].flows
    expect(flows[0].windowSeconds).toBe(3600)
    expect(flows[0].coverageSeconds).toBe(1200)
    // 15m/5m/1m 仍在覆盖范围内，都是完整周期
    expect(flows[1].coverageSeconds).toBe(900)
    expect(flows[2].coverageSeconds).toBe(300)
    expect(flows[3].coverageSeconds).toBe(60)
  })

  it('官方聚合同一周期优先于自算，短窗口快照被丢弃', () => {
    const panel = reassemblePanel(
      {
        symbol: 'BTCUSDT',
        depth: [],
        flow: [flowRecord('aggregated'), flowRecord('recent-trades')],
        flowMinutes: recentMinutes(20),
        positioning: [],
        largeOrders: [],
      },
      ['bybit'],
      NOW,
    )
    const flows = panel.venues[0].flows
    const hour = flows.find((flow) => flow.windowSeconds === 3600)
    expect(hour?.granularity).toBe('aggregated')
    expect(hour?.takerBuyRatio).toBeCloseTo(0.9, 6)
    // 最近若干笔的短窗口不能混进四档周期
    expect(flows.filter((flow) => flow.windowSeconds < 60)).toEqual([])
  })

  it('采集停摆时周期消失，不会把旧数据当成刚刚', () => {
    // 数据停在 40 分钟前：从最新已结束分钟往回数第一格就缺行
    const stale = recentMinutes(60).slice(0, 20)
    const panel = reassemblePanel(
      {
        symbol: 'BTCUSDT',
        depth: [],
        flow: [],
        flowMinutes: stale,
        positioning: [],
        largeOrders: [],
      },
      ['bybit'],
      NOW,
    )
    expect(panel.venues[0].flows).toEqual([])
  })
})
