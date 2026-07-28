import { describe, expect, it } from 'vitest'

import { HK_MARKET_SESSION, resolveMarketSessionSlots } from '../../../foundation/utils/sessionTimeLabels'
import type { SymbolSpec } from '../../../controllers/types'
import { MarketSessionRegistry } from '../marketSessionRegistry'
import { resolveSymbolMarketSession } from '../resolveSymbolMarketSession'

describe('resolveSymbolMarketSession', () => {
  it('resolves HK to its 330-slot trading session', () => {
    const spec: SymbolSpec = { symbol: '01810', market: 'HK', period: 'timeshare' }

    const session = resolveSymbolMarketSession(spec, new MarketSessionRegistry())

    expect(session).toEqual(HK_MARKET_SESSION)
    expect(resolveMarketSessionSlots(session)).toBe(330)
  })

  it('rejects missing market without fallback', () => {
    const spec = { symbol: '01810', period: 'timeshare' } as SymbolSpec

    expect(() => resolveSymbolMarketSession(spec, new MarketSessionRegistry())).toThrow(
      'SymbolSpec.market is required for 01810',
    )
  })

  it('rejects an unregistered market', () => {
    const spec: SymbolSpec = { symbol: 'IF2608', market: 'FUTURES', period: 'timeshare' }

    expect(() => resolveSymbolMarketSession(spec, new MarketSessionRegistry())).toThrow(
      'Market session is not registered: FUTURES',
    )
  })
})
