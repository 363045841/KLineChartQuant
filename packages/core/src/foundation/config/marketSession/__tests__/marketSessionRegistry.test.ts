import { describe, expect, it } from 'vitest'

import { HK_MARKET_SESSION, KR_MARKET_SESSION } from '@/foundation/utils/sessionTimeLabels'
import { FOREX_MARKET_SESSION } from '../forexMarketSession'
import {
  BUILTIN_MARKET_IDS,
  DEFAULT_CUSTOM_DATA_MARKET,
  MarketSessionRegistry,
  resolveCustomDataMarket,
} from '../marketSessionRegistry'

describe('MarketSessionRegistry', () => {
  it('provides built-in market sessions per instance', () => {
    const registry = new MarketSessionRegistry()

    expect(registry.getRequired('HK')).toEqual(HK_MARKET_SESSION)
    expect(registry.getRequired('KR')).toEqual(KR_MARKET_SESSION)
  })

  it('provides the MT5 connector session (24/5 forex calendar) as builtin', () => {
    const registry = new MarketSessionRegistry()

    expect(registry.getRequired('MT5')).toEqual(FOREX_MARKET_SESSION)
  })

  it('throws for an unknown market without falling back', () => {
    const registry = new MarketSessionRegistry()

    expect(() => registry.getRequired('UNKNOWN')).toThrow(
      'Market session is not registered: UNKNOWN',
    )
  })

  it('keeps overrides isolated between chart instances', () => {
    const first = new MarketSessionRegistry()
    const second = new MarketSessionRegistry()
    const custom = {
      timeZone: 'Asia/Hong_Kong',
      sessions: [{ open: 10 * 60, close: 12 * 60 }],
      slotMinutes: 1,
    }

    first.register('HK', custom)

    expect(first.getRequired('HK')).toEqual(custom)
    expect(second.getRequired('HK')).toEqual(HK_MARKET_SESSION)
  })

  it('rejects blank market ids and invalid sessions', () => {
    const registry = new MarketSessionRegistry()

    expect(() => registry.register('  ', HK_MARKET_SESSION)).toThrow('Market id is required')
    expect(() =>
      registry.register('BROKEN', {
        timeZone: '',
        sessions: [],
      }),
    ).toThrow('Invalid market session: BROKEN')
  })

  it('registers every id in BUILTIN_MARKET_IDS', () => {
    const registry = new MarketSessionRegistry()

    for (const id of BUILTIN_MARKET_IDS) expect(registry.get(id)).toBeDefined()
  })
})

describe('resolveCustomDataMarket', () => {
  it('defaults missing or blank market to the neutral MT5 (UTC 00:00-24:00) session', () => {
    expect(DEFAULT_CUSTOM_DATA_MARKET).toBe('MT5')
    expect(resolveCustomDataMarket(undefined)).toBe('MT5')
    expect(resolveCustomDataMarket('   ')).toBe('MT5')
    expect(new MarketSessionRegistry().getRequired(resolveCustomDataMarket(undefined))).toEqual(
      FOREX_MARKET_SESSION,
    )
  })

  it('keeps an explicit market (trimmed) without validating it', () => {
    expect(resolveCustomDataMarket(' US ')).toBe('US')
    expect(resolveCustomDataMarket('FUTURES')).toBe('FUTURES')
  })
})
