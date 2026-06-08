import { afterEach, describe, expect, it, vi } from 'vitest'
import { SemanticChartController, __setDataFetcher, type SemanticChartAdapter } from '../controller'
import type { SemanticChartConfig } from '../types'

function createConfig(indicators: SemanticChartConfig['indicators']): SemanticChartConfig {
  return {
    version: '1.0.0',
    data: {
      source: 'baostock',
      symbol: '600000',
      exchange: 'SH',
      startDate: '2025-01-01',
      endDate: '2025-01-02',
      period: 'daily',
      adjust: 'qfq',
    },
    indicators,
  }
}

function createChartAdapter(): SemanticChartAdapter {
  return {
    updateData: vi.fn(),
    updateRendererConfig: vi.fn(),
    clearSubPanes: vi.fn(),
    createSubPane: vi.fn(() => true),
    clearCustomMarkers: vi.fn(),
    updateCustomMarkers: vi.fn(),
  }
}

describe('SemanticChartController', () => {
  afterEach(() => {
    __setDataFetcher(null)
  })

  it('routes semantic sub indicators through registered definitions', async () => {
    __setDataFetcher(vi.fn(async () => []))
    const chart = createChartAdapter()
    const controller = new SemanticChartController(chart)

    const result = await controller.applyConfig(
      createConfig({
        sub: [
          { type: 'VOLUME', enabled: true },
          { type: 'RSI', enabled: true, params: { period1: 7 } },
          { type: 'MACD', enabled: false, params: { fast: 8 } },
        ],
      }),
    )

    expect(result).toEqual({ success: true })
    expect(chart.clearSubPanes).toHaveBeenCalledTimes(1)
    expect(chart.createSubPane).toHaveBeenCalledTimes(2)
    expect(chart.createSubPane).toHaveBeenCalledWith('VOLUME_0', 'VOLUME', undefined)
    expect(chart.createSubPane).toHaveBeenCalledWith('RSI_0', 'RSI', { period1: 7 })
  })
})
