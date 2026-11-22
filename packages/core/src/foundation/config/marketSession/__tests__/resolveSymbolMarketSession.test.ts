import { describe, expect, it } from 'vitest'
import { HK_MARKET_SESSION, resolveMarketSessionSlots } from '@/foundation/utils/sessionTimeLabels'
import { MarketSessionRegistry } from '../marketSessionRegistry'
import { resolveSymbolMarketSession } from '../resolveSymbolMarketSession'

describe('resolveSymbolMarketSession', () => {
  it('resolves HK to its 330-slot trading session', () => {
    const reference = { sessionId: 'HK', symbol: '01810' }

    const session = resolveSymbolMarketSession(reference, new MarketSessionRegistry())

    expect(session).toEqual(HK_MARKET_SESSION)
    expect(resolveMarketSessionSlots(session)).toBe(330)
  })

  it('falls back to the exchange when no session is declared', () => {
    const reference = { exchange: 'HK', symbol: '01810' }
    expect(resolveSymbolMarketSession(reference, new MarketSessionRegistry())).toEqual(
      HK_MARKET_SESSION,
    )
  })

  it('rejects missing session and exchange without fallback', () => {
    expect(() =>
      resolveSymbolMarketSession({ symbol: '01810' }, new MarketSessionRegistry()),
    ).toThrow('Instrument sessionId or exchange is required for 01810')
  })

  it('rejects an unregistered market', () => {
    const reference = { sessionId: 'FUTURES', symbol: 'IF2608' }

    expect(() => resolveSymbolMarketSession(reference, new MarketSessionRegistry())).toThrow(
      'Market session is not registered: FUTURES',
    )
  })
})
