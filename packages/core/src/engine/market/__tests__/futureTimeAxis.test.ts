/**
 * 交易日历外推模块 futureTimeAxis 的单元测试。
 * 语义锚点：24/5 跨周末跳交易日、24/7 纯线性、日内周期 session 内线性步进。
 */
import { describe, expect, it } from 'vitest'
import { CRYPTO_MARKET_SESSION } from '../cryptoMarketSession.js'
import { FOREX_MARKET_SESSION } from '../forexMarketSession.js'
import { projectTradingTimestamp } from '../futureTimeAxis.js'

const DAY = 86_400_000

describe('projectTradingTimestamp', () => {
  it('24/5：周五日线之后跳到下周一', () => {
    const friday = Date.UTC(2026, 0, 2, 22) // 2026-01-02 是周五
    const next = projectTradingTimestamp(FOREX_MARKET_SESSION, friday, 1, DAY)
    expect(new Date(next).getUTCDay()).toBe(1) // 2026-01-05 是周一
  })

  it('24/5：周中日线按自然日推进', () => {
    const tuesday = Date.UTC(2026, 0, 6, 22)
    const next = projectTradingTimestamp(FOREX_MARKET_SESSION, tuesday, 1, DAY)
    expect(new Date(next).getUTCDay()).toBe(3) // 周三
  })

  it('24/5：周六起点首个预测是周一', () => {
    const saturday = Date.UTC(2026, 0, 3, 12)
    const next = projectTradingTimestamp(FOREX_MARKET_SESSION, saturday, 1, DAY)
    expect(new Date(next).getUTCDay()).toBe(1)
  })

  it('周期感知：15min 日内在交易日线性步进', () => {
    const base = Date.UTC(2026, 0, 6, 10, 0) // 周二
    const next = projectTradingTimestamp(FOREX_MARKET_SESSION, base, 3, 900_000)
    expect(next - base).toBe(3 * 900_000)
  })

  it('24/7：纯线性外推（周六 +2 天仍线性）', () => {
    const base = Date.UTC(2026, 0, 3, 12) // 周六
    const next = projectTradingTimestamp(CRYPTO_MARKET_SESSION, base, 2, DAY)
    expect(next - base).toBe(2 * DAY)
  })

  it('24/5：周五日内跨周末（15min 步进落周六 → 跳到周一同时刻）', () => {
    const friday = Date.UTC(2026, 0, 2, 23, 45) // 周五 23:45，+15min 落周六 00:00
    const next = projectTradingTimestamp(FOREX_MARKET_SESSION, friday, 1, 900_000)
    expect(new Date(next).getUTCDay()).toBe(1) // 周一
    expect(new Date(next).getUTCHours()).toBe(0) // 保持落点时刻（周六 00:00 的墙钟）
  })

  it('非交易日步数被跳过：周五日线 +2 steps → 下周二', () => {
    const friday = Date.UTC(2026, 0, 2, 22)
    const next = projectTradingTimestamp(FOREX_MARKET_SESSION, friday, 2, DAY)
    expect(new Date(next).getUTCDay()).toBe(2)
  })

  it('tradingDays 空数组是病态输入：按缺省全周线性处理', () => {
    const base = Date.UTC(2026, 0, 3, 12) // 周六
    const next = projectTradingTimestamp({ ...FOREX_MARKET_SESSION, tradingDays: [] }, base, 2, DAY)
    expect(next - base).toBe(2 * DAY)
  })
})
