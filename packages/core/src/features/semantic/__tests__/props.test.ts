import { describe, expect, it } from 'vitest'

import { toKLineChartProps } from '../props'
import type { SemanticChartConfig } from '../types'

describe('toKLineChartProps', () => {
  it('maps semantic data, indicators, and markers into component props', () => {
    const config: SemanticChartConfig = {
      version: '1.0.0',
      data: {
        source: 'baostock',
        market: 'CN',
        symbol: '600000',
        exchange: 'SH',
        startDate: '2025-01-01',
        endDate: '2025-01-02',
        period: 'daily',
        adjust: 'qfq',
      },
      indicators: {
        main: [{ type: 'BOLL', enabled: true, params: { period: 21 } }],
        sub: [{ type: 'MACD', enabled: false, params: { fast: 8 } }],
      },
      markers: {
        customMarkers: [{ id: 'buy-1', date: '2025-01-02', shape: 'arrow_up' }],
      },
    }

    expect(toKLineChartProps(config)).toEqual({
      symbols: [
        {
          symbol: '600000',
          market: 'CN',
          exchange: 'SH',
          period: 'daily',
          adjust: 'qfq',
          source: 'baostock',
          startDate: '2025-01-01',
          endDate: '2025-01-02',
        },
      ],
      indicators: [
        { definitionId: 'BOLL', role: 'main', enabled: true, params: { period: 21 } },
        { definitionId: 'MACD', role: 'sub', enabled: false, params: { fast: 8 } },
      ],
      customMarkers: [
        {
          id: 'buy-1',
          date: '2025-01-02',
          timestamp: Date.UTC(2025, 0, 2, -8, 0),
          shape: 'arrow_up',
        },
      ],
    })
  })
})
