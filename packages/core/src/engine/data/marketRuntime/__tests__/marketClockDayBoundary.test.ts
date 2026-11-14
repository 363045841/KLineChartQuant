/** 会话投影：注册表里的 dayBoundary 必须原样进到脚本时间上下文。 */

import { describe, expect, it } from 'vitest'
import { timeValue } from '@363045841yyt/klinechart-plot-contracts'
import { MarketSessionRegistry } from '@/foundation/config/marketSession/marketSessionRegistry.js'
import type { ReadyMarketSession } from '../types.js'
import { marketClock } from '../impl/indicatorBarsProjector.js'

describe('marketClock dayBoundary', () => {
  it('按注册表里的日界切分交易日', () => {
    const registry = new MarketSessionRegistry({
      BINANCE_PERP: {
        timeZone: 'UTC',
        sessions: [{ open: 0, close: 1440 }],
        tradingDays: [0, 1, 2, 3, 4, 5, 6],
        dayBoundary: { time: '00:00', zone: 'Asia/Shanghai' },
      },
    })
    const ready = {
      instrument: { sessionId: 'BINANCE_PERP' },
      selection: { period: '15' },
    } as unknown as ReadyMarketSession

    const clock = marketClock(ready, registry)
    if (!clock) throw new Error('缺少时间上下文')

    // 北京 11-15 02:30 属于 11-15；北京 11-14 23:00 属于 11-14。
    expect(timeValue(clock, 'tradingday', '', Date.UTC(2026, 10, 14, 18, 30))).toBe(
      Date.UTC(2026, 10, 15),
    )
    expect(timeValue(clock, 'tradingday', '', Date.UTC(2026, 10, 14, 15, 0))).toBe(
      Date.UTC(2026, 10, 14),
    )
  })
})
