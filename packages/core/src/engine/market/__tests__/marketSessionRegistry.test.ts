import { describe, expect, it } from 'vitest'

import { HK_MARKET_SESSION } from '../../../foundation/utils/sessionTimeLabels'
import { MarketSessionRegistry } from '../marketSessionRegistry'

describe('MarketSessionRegistry', () => {
  it('provides built-in market sessions per instance', () => {
    const registry = new MarketSessionRegistry()

    expect(registry.getRequired('HK')).toEqual(HK_MARKET_SESSION)
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
})
