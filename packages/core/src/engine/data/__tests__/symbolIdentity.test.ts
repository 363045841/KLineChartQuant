/** 品种身份：只由 instrument 决定，与周期、复权和展示字段无关。 */
import { describe, expect, it } from 'vitest'
import { symbolInfoIdentityKey, symbolSpecIdentityKey } from '../symbolIdentity'
import { makeInstrument, makeSymbolSpec } from './helpers/symbolSpecFixture'

describe('symbolSpecIdentityKey', () => {
  it('uses source and instrument id only', () => {
    const instrument = makeInstrument({
      id: 'gotdx:stock:1:600519',
      symbol: '600519',
      source: 'gotdx',
      market: 'CN',
    })
    const daily = makeSymbolSpec({ instrument, period: 'daily', adjust: 'none' })
    const weekly = makeSymbolSpec({ instrument, period: 'weekly', adjust: 'qfq' })

    expect(symbolSpecIdentityKey(daily)).toBe('instrument:gotdx:gotdx:stock:1:600519')
    expect(symbolSpecIdentityKey(weekly)).toBe(symbolSpecIdentityKey(daily))
  })

  it('keeps the same code distinct across sources', () => {
    const gotdx = makeSymbolSpec({ symbol: '600519', source: 'gotdx', id: 'gotdx:1', market: 'CN' })
    const another = makeSymbolSpec({
      symbol: '600519',
      source: 'other',
      id: 'other:1',
      market: 'CN',
    })

    expect(symbolSpecIdentityKey(gotdx)).not.toBe(symbolSpecIdentityKey(another))
  })
})

describe('symbolInfoIdentityKey', () => {
  it('prefers the stable catalog id', () => {
    expect(
      symbolInfoIdentityKey({
        id: 'gotdx:stock:1:600519',
        symbol: '600519',
        market: 'CN',
        source: 'gotdx',
        description: '浦发银行',
      }),
    ).toBe('instrument:gotdx:gotdx:stock:1:600519')
  })

  it('falls back to source, market, exchange, code and params when no id exists', () => {
    const base = { symbol: '600519', market: 'CN', exchange: 'SH', source: 'gotdx' }
    const first = symbolInfoIdentityKey({ ...base, params: { market: 1 } })
    const second = symbolInfoIdentityKey({ ...base, params: { category: 31 } })

    expect(first).not.toBe(second)
    expect(first).toBe(symbolInfoIdentityKey({ ...base, params: { market: 1 } }))
  })
})
