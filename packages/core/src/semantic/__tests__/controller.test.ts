import { afterEach, describe, expect, it, vi } from 'vitest'
import { SemanticChartController, type SemanticChartAdapter } from '../controller'
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
    setSymbols: vi.fn(),
    updateData: vi.fn(),
    updateRendererConfig: vi.fn(),
    addIndicator: vi.fn((definitionId: string) => definitionId),
    removeIndicator: vi.fn(() => true),
    enableMainIndicator: vi.fn(() => true),
    disableMainIndicator: vi.fn(() => true),
    clearSubPanes: vi.fn(),
    createSubPane: vi.fn(() => true),
    clearCustomMarkers: vi.fn(),
    updateCustomMarkers: vi.fn(),
  }
}

describe('SemanticChartController', () => {
  it('routes semantic sub indicators through registered definitions', async () => {
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

  it('routes semantic main indicators through chart main indicator API', async () => {
    const chart = createChartAdapter()
    const controller = new SemanticChartController(chart)

    const result = await controller.applyConfig(
      createConfig({
        main: [
          { type: 'BOLL', enabled: true, params: { period: 21, multiplier: 2.5 } },
          { type: 'MA', enabled: false, params: { periods: [5, 20] } },
        ],
      }),
    )

    expect(result).toEqual({ success: true })
    expect(chart.addIndicator).toHaveBeenCalledWith('BOLL', 'main', { period: 21, multiplier: 2.5 })
    expect(chart.removeIndicator).toHaveBeenCalledWith('MA')
    expect(chart.enableMainIndicator).not.toHaveBeenCalled()
    expect(chart.disableMainIndicator).not.toHaveBeenCalled()
    expect(chart.updateRendererConfig).not.toHaveBeenCalledWith('boll', expect.anything())
  })

  it('calls setSymbols on the adapter when applying config', async () => {
    const chart = createChartAdapter()
    const controller = new SemanticChartController(chart)

    await controller.applyConfig(createConfig({}))

    expect(chart.setSymbols).toHaveBeenCalledWith([{
      symbol: '600000',
      exchange: 'SH',
      period: 'daily',
      adjust: 'qfq',
      source: 'baostock',
      startDate: '2025-01-01',
      endDate: '2025-01-02',
    }])
  })
})
