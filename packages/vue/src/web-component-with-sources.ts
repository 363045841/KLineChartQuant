// WC entry WITH builtin market-data sources registered (the bare web-component.ts
// tree-shakes the side-effect source registrations away, leaving the shell with an
// empty provider registry). Sources are force-imported first, then the element is
// RE-EXPORTED so the side-effect chain survives package-level tree shaking.
//
// Additionally: the shell's SourceRouter filters enabled providers by
// source.capabilities, which the stock flow only populates via probe() (an
// aggregation-UI-only path). Static capability declarations here unblock the
// headless bootstrap: providers are routable on first bars request.
import { marketDataProviderRegistry } from '@363045841yyt/klinechart-core/controllers'
import '@363045841yyt/klinechart-core/dist/data/provider/sources/baostock.js'
import '@363045841yyt/klinechart-core/dist/data/provider/sources/finshare.js'
import '@363045841yyt/klinechart-core/dist/data/provider/sources/gotdx.js'
import '@363045841yyt/klinechart-core/dist/data/provider/sources/mock.js'
import '@363045841yyt/klinechart-core/dist/data/provider/sources/tradingview.js'
import './web-component'
import { KLineChartElement } from './web-component'
export { KLineChartElement }
export default KLineChartElement

// Static capabilities for the sources a host may wire up (idempotent).
const STATIC_CAPS: Record<string, unknown> = {
  tradingview: {
    assetClasses: ['forex', 'crypto', 'future', 'index'],
    bars: {
      periods: ['1min', '5min', '15min', '30min', '60min', '4h', 'daily', 'weekly', 'monthly'],
      adjustments: ['none'],
    },
  },
  mock: {
    assetClasses: ['index'],
    bars: { periods: ['daily'], adjustments: ['none'] },
  },
}
for (const [id, caps] of Object.entries(STATIC_CAPS)) {
  const provider = marketDataProviderRegistry.get(id)
  if (provider && provider.source.capabilities === undefined) {
    provider.source.capabilities = caps as never
  }
}
