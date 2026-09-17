import type { SymbolSpec } from '../../controllers/types.js'
import type { MarketSessionConfig } from '../../foundation/utils/sessionTimeLabels.js'
import type { MarketSessionRegistry } from './marketSessionRegistry.js'

export function resolveSymbolMarketSession(
  spec: SymbolSpec,
  registry: MarketSessionRegistry,
): MarketSessionConfig {
  const market = spec.market?.trim()
  if (!market) throw new Error(`SymbolSpec.market is required for ${spec.symbol}`)
  return registry.getRequired(market)
}
