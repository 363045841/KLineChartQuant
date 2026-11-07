/** 品种标识：身份键、前缀断言、展示标签与搜索输入解析。 */

import { describe, expect, it } from 'vitest'

import {
  formatInstrumentLabel,
  instrumentIdentityKey,
  isInstrumentIdOfSource,
  parseInstrumentQuery,
} from '../impl/instrumentIdentity'

describe('instrumentIdentityKey', () => {
  // 验证身份键直接取 id：id 已带 sourceId 前缀，再拼一次会得到双层前缀。
  it('直接返回 id，不再拼接 sourceId', () => {
    expect(instrumentIdentityKey({ id: 'binance:spot:BTCUSDT', sourceId: 'binance' })).toBe(
      'binance:spot:BTCUSDT',
    )
  })

  // 验证同一代码在现货与永续是两个身份。
  it('区分同一代码的现货与永续', () => {
    const spot = instrumentIdentityKey({ id: 'binance:spot:BTCUSDT', sourceId: 'binance' })
    const perp = instrumentIdentityKey({ id: 'binance:perp:BTCUSDT', sourceId: 'binance' })
    expect(spot).not.toBe(perp)
  })
})

describe('isInstrumentIdOfSource', () => {
  it.each([
    ['binance:spot:BTCUSDT', 'binance', true],
    ['binance:perp:BTCUSDT', 'binance', true],
    ['mt5:XAUUSD', 'mt5', true],
    ['gotdx:stock:1:600519', 'gotdx', true],
    ['binance:spot:BTCUSDT', 'mt5', false],
    ['BTCUSDT', 'binance', false],
    ['', 'binance', false],
    [':BTCUSDT', 'binance', false],
  ])('%s 属于 %s → %s', (id, sourceId, expected) => {
    expect(isInstrumentIdOfSource(id, sourceId)).toBe(expected)
  })
})

describe('formatInstrumentLabel', () => {
  // 验证永续代码追加 TV 惯例的 .P 后缀，市场来自 providerRef.market。
  it('永续代码追加 .P 并带上市场', () => {
    expect(
      formatInstrumentLabel({
        symbol: 'BTCUSDT',
        providerRef: { symbol: 'BTCUSDT', market: 'perp' },
      }),
    ).toEqual({ code: 'BTCUSDT.P', market: 'perp' })
  })

  // 验证现货代码保持原样，不产生任何后缀。
  it('现货代码保持原样', () => {
    expect(
      formatInstrumentLabel({
        symbol: 'BTCUSDT',
        providerRef: { symbol: 'BTCUSDT', market: 'spot' },
      }),
    ).toEqual({ code: 'BTCUSDT', market: 'spot' })
  })

  // 验证没有 market 字段时不产生空字符串市场。
  it('缺少 market 时只返回代码', () => {
    expect(formatInstrumentLabel({ symbol: 'XAUUSD', providerRef: { symbol: 'XAUUSD' } })).toEqual({
      code: 'XAUUSD',
    })
  })
})

describe('parseInstrumentQuery', () => {
  it.each([
    ['BTCUSDT.P', { keyword: 'BTCUSDT', market: 'perp' }],
    ['btcusdt.p', { keyword: 'btcusdt', market: 'perp' }],
    ['  ETHBTC.P  ', { keyword: 'ETHBTC', market: 'perp' }],
    ['BTCUSDT', { keyword: 'BTCUSDT' }],
    ['XAUUSD', { keyword: 'XAUUSD' }],
    ['.P', { keyword: '.P' }],
    ['', { keyword: '' }],
  ])('%s → %j', (input, expected) => {
    expect(parseInstrumentQuery(input)).toEqual(expected)
  })

  // 验证名字本身以 .HK 之类结尾的代码不会被 .P 规则误伤。
  it('非 .P 后缀的代码原样保留', () => {
    expect(parseInstrumentQuery('600519.HK')).toEqual({ keyword: '600519.HK' })
  })
})
