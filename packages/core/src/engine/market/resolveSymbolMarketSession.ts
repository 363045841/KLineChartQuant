import type { SymbolSpec } from '../../controllers/types'
import type { MarketSessionConfig } from '../../foundation/utils/sessionTimeLabels'
import type { MarketSessionRegistry } from './marketSessionRegistry'

export function resolveSymbolMarketSession(
  spec: SymbolSpec,
  registry: MarketSessionRegistry,
): MarketSessionConfig {
  const market = spec.market?.trim()
  if (!market) throw new Error(`SymbolSpec.market is required for ${spec.symbol}`)
  return registry.getRequired(market)
}
