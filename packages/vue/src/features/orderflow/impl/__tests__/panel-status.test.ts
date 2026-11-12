/** 面板指示灯三态：错误优先，其次超时未更新，其余在线。 */
import { describe, expect, it } from 'vitest'
import {
  PANEL_STALE_MS,
  describePanelStatus,
  staleVenues,
  withVenueHealth,
} from '../panel-status.js'

/** 固定的判定时刻，避免用例依赖真实时钟。 */
const NOW = 1_794_500_000_000

describe('describePanelStatus', () => {
  it('请求失败时报错，且优先于其它状态', () => {
    const status = describePanelStatus({
      error: '服务端返回的面板结构不符合预期。',
      lastUpdated: NOW - 1_000,
      now: NOW,
    })

    expect(status.tone).toBe('error')
    expect(status.label).toContain('服务端返回的面板结构不符合预期。')
  })

  it('从未成功过时报离线，不冒充在线', () => {
    expect(describePanelStatus({ error: null, lastUpdated: null, now: NOW }).tone).toBe('offline')
  })

  it('数据超过阈值没更新时报离线，服务 200 也不掩盖', () => {
    const status = describePanelStatus({
      error: null,
      lastUpdated: NOW - PANEL_STALE_MS - 1,
      now: NOW,
    })

    expect(status.tone).toBe('offline')
    expect(status.label).toContain('分钟没有更新')
  })

  it('阈值内正常更新时报在线', () => {
    const status = describePanelStatus({
      error: null,
      lastUpdated: NOW - 30_000,
      now: NOW,
    })

    expect(status.tone).toBe('online')
  })
})

describe('staleVenues', () => {
  it('点名落后超阈值的交易所，按落后时长从大到小', () => {
    const stale = staleVenues(
      [
        { venue: 'binance', updatedAt: NOW - 12 * 60_000 },
        { venue: 'bitget', updatedAt: NOW - 23 * 60_000 },
        { venue: 'bybit', updatedAt: NOW - 30_000 },
      ],
      NOW,
    )

    expect(stale.map((item) => item.venue)).toEqual(['bitget', 'binance'])
    expect(stale.map((item) => item.minutes)).toEqual([23, 12])
  })

  it('从未有记录的交易所不点名：那是没有这类数据，不是停摆', () => {
    expect(staleVenues([{ venue: 'okx', updatedAt: null }], NOW)).toEqual([])
  })

  it('阈值内不点名', () => {
    expect(staleVenues([{ venue: 'bybit', updatedAt: NOW - PANEL_STALE_MS }], NOW)).toEqual([])
  })
})

describe('withVenueHealth', () => {
  const online = { tone: 'online' as const, label: '在线：数据是最新的' }

  it('有交易所停摆时降为黄灯，并把名字写进提示', () => {
    const status = withVenueHealth(online, [
      { venue: 'bitget', minutes: 23 },
      { venue: 'binance', minutes: 12 },
    ])

    expect(status.tone).toBe('warning')
    expect(status.label).toBe('在线：数据是最新的；以下交易所停摆：bitget 23 分钟、binance 12 分钟')
  })

  it('没有停摆时原样返回', () => {
    expect(withVenueHealth(online, [])).toEqual(online)
  })

  it('已经报错或整体离线时不降级，红与灰优先', () => {
    const error = { tone: 'error' as const, label: '连接异常：超时' }
    const offline = { tone: 'offline' as const, label: '离线：数据已经 12 分钟没有更新' }
    const stale = [{ venue: 'bitget', minutes: 23 }]

    expect(withVenueHealth(error, stale).tone).toBe('error')
    expect(withVenueHealth(offline, stale).tone).toBe('offline')
  })
})
