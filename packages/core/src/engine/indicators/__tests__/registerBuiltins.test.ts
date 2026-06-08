import { describe, expect, it, vi } from 'vitest'
import { getRegisteredIndicatorDefinition } from '../indicatorDefinitionRegistry'
import { getBuiltinIndicatorDefinitions } from '../registerBuiltins'

describe('builtin indicator registration', () => {
  it('loads all builtin indicator definitions through decorators', () => {
    const definitions = getBuiltinIndicatorDefinitions()

    expect(definitions).toHaveLength(40)
    expect(definitions.map((definition) => definition.name)).toEqual(
      expect.arrayContaining([
        'ma',
        'boll',
        'rsi',
        'macd',
        'volume',
        'volumeProfile',
        'zones',
      ]),
    )
  })

  it('allows builtin definitions to be queried by display name', () => {
    expect(getRegisteredIndicatorDefinition('RSI')?.name).toBe('rsi')
    expect(getRegisteredIndicatorDefinition('MACD')?.name).toBe('macd')
    expect(getRegisteredIndicatorDefinition('VOL')?.name).toBe('volume')
  })

  it('registers metadata config updaters for stage 4A indicators', () => {
    expect(getRegisteredIndicatorDefinition('RSI')?.updateConfig).toBeTypeOf('function')
    expect(getRegisteredIndicatorDefinition('MACD')?.updateConfig).toBeTypeOf('function')
    expect(getRegisteredIndicatorDefinition('VOL')?.updateConfig).toBeTypeOf('function')
    expect(getRegisteredIndicatorDefinition('VOLUME_PROFILE')?.updateConfig).toBeTypeOf('function')
  })

  it('registers metadata config updaters for stage 4B indicators', () => {
    const expectedIndicators = [
      'CCI', 'STOCH', 'MOM', 'WMSR', 'KST', 'FASTK', 'ATR',
      'WMA', 'DEMA', 'TEMA', 'HMA', 'KAMA', 'SAR',
      'SUPERTREND', 'KELTNER', 'DONCHIAN', 'ICHIMOKU',
      'ROC', 'TRIX', 'HV', 'PARKINSON', 'CHAIKIN_VOL',
      'VMA', 'OBV', 'PVT', 'VWAP', 'CMF', 'MFI',
      'PIVOT', 'FIB', 'STRUCTURE', 'ZONES',
    ]
    for (const id of expectedIndicators) {
      expect(getRegisteredIndicatorDefinition(id)?.updateConfig).toBeTypeOf('function')
    }
  })

  it('routes stage 4A metadata config updates to scheduler methods', () => {
    const scheduler = {
      updateRSIConfig: vi.fn(),
      updateMACDConfig: vi.fn(),
      updateVolumeProfileConfig: vi.fn(),
    }

    getRegisteredIndicatorDefinition('RSI')?.updateConfig?.(scheduler, { period1: 7 }, 'RSI_0')
    getRegisteredIndicatorDefinition('MACD')?.updateConfig?.(scheduler, { fastPeriod: 8 }, 'MACD_0')
    getRegisteredIndicatorDefinition('VOLUME_PROFILE')?.updateConfig?.(scheduler, { bins: 32 }, 'VP_0')
    getRegisteredIndicatorDefinition('VOL')?.updateConfig?.(scheduler, {}, 'VOL_0')

    expect(scheduler.updateRSIConfig).toHaveBeenCalledWith({ period1: 7 }, 'RSI_0')
    expect(scheduler.updateMACDConfig).toHaveBeenCalledWith({ fastPeriod: 8 }, 'MACD_0')
    expect(scheduler.updateVolumeProfileConfig).toHaveBeenCalledWith({ bins: 32 }, 'VP_0')
  })

  it('routes stage 4B metadata config updates to scheduler methods', () => {
    const scheduler = {
      updateCCIConfig: vi.fn(),
      updateATRConfig: vi.fn(),
      updateChaikinVolConfig: vi.fn(),
      updateZonesConfig: vi.fn(),
    }

    getRegisteredIndicatorDefinition('CCI')?.updateConfig?.(scheduler, { period: 14 }, 'CCI_0')
    getRegisteredIndicatorDefinition('ATR')?.updateConfig?.(scheduler, { period: 10 }, 'ATR_0')
    getRegisteredIndicatorDefinition('CHAIKIN_VOL')?.updateConfig?.(scheduler, { emaPeriod: 10 }, 'CV_0')
    getRegisteredIndicatorDefinition('ZONES')?.updateConfig?.(scheduler, { showFVG: true }, 'Z_0')

    expect(scheduler.updateCCIConfig).toHaveBeenCalledWith({ period: 14 }, 'CCI_0')
    expect(scheduler.updateATRConfig).toHaveBeenCalledWith({ period: 10 }, 'ATR_0')
    expect(scheduler.updateChaikinVolConfig).toHaveBeenCalledWith({ emaPeriod: 10 }, 'CV_0')
    expect(scheduler.updateZonesConfig).toHaveBeenCalledWith({ showFVG: true }, 'Z_0')
  })

  it('registers dedicated scale renderer factories for stage 5A indicators', () => {
    const expectedIndicators = [
      'VOL', 'MACD', 'RSI', 'CCI', 'STOCH', 'MOM', 'WMSR', 'KST', 'FASTK', 'ATR',
    ]

    for (const id of expectedIndicators) {
      expect(getRegisteredIndicatorDefinition(id)?.scaleRendererFactory).toBeTypeOf('function')
    }
  })

  it('creates scale renderers through stage 5A metadata factories', () => {
    const rsiScaleRenderer = getRegisteredIndicatorDefinition('RSI')?.scaleRendererFactory?.({
      indicatorId: 'RSI',
      paneId: 'RSI_0',
      axisWidth: 80,
      yPaddingPx: 4,
      getCrosshair: () => null,
    })
    const volumeScaleRenderer = getRegisteredIndicatorDefinition('VOL')?.scaleRendererFactory?.({
      indicatorId: 'VOLUME',
      paneId: 'VOLUME_0',
      axisWidth: 80,
      yPaddingPx: 4,
      getCrosshair: () => null,
    })

    expect(rsiScaleRenderer?.name).toBe('rsiScale_RSI_0')
    expect(volumeScaleRenderer?.name).toBe('volumeScale_VOLUME_0')
  })

  it('registers generic scale metadata for stage 5B indicators', () => {
    const expected: Record<string, { indicatorKey: string; label: string; decimals: number }> = {
      WMA: { indicatorKey: 'wma', label: 'WMA', decimals: 2 },
      DEMA: { indicatorKey: 'dema', label: 'DEMA', decimals: 2 },
      TEMA: { indicatorKey: 'tema', label: 'TEMA', decimals: 2 },
      HMA: { indicatorKey: 'hma', label: 'HMA', decimals: 2 },
      KAMA: { indicatorKey: 'kama', label: 'KAMA', decimals: 2 },
      SAR: { indicatorKey: 'sar', label: 'SAR', decimals: 4 },
      SUPERTREND: { indicatorKey: 'supertrend', label: 'SuperTrend', decimals: 2 },
      KELTNER: { indicatorKey: 'keltner', label: 'Keltner', decimals: 2 },
      DONCHIAN: { indicatorKey: 'donchian', label: 'Donchian', decimals: 2 },
      ICHIMOKU: { indicatorKey: 'ichimoku', label: 'Ichimoku', decimals: 2 },
      ROC: { indicatorKey: 'roc', label: 'ROC', decimals: 2 },
      TRIX: { indicatorKey: 'trix', label: 'TRIX', decimals: 6 },
      HV: { indicatorKey: 'hv', label: 'HV', decimals: 2 },
      PARKINSON: { indicatorKey: 'parkinson', label: 'Parkinson', decimals: 2 },
      CHAIKIN_VOL: { indicatorKey: 'chaikinVol', label: 'ChaikinVol', decimals: 2 },
      VMA: { indicatorKey: 'vma', label: 'VMA', decimals: 0 },
      OBV: { indicatorKey: 'obv', label: 'OBV', decimals: 0 },
      PVT: { indicatorKey: 'pvt', label: 'PVT', decimals: 0 },
      VWAP: { indicatorKey: 'vwap', label: 'VWAP', decimals: 2 },
      CMF: { indicatorKey: 'cmf', label: 'CMF', decimals: 4 },
      MFI: { indicatorKey: 'mfi', label: 'MFI', decimals: 2 },
      PIVOT: { indicatorKey: 'pivot', label: 'Pivot', decimals: 2 },
      FIB: { indicatorKey: 'fib', label: 'Fib', decimals: 4 },
      STRUCTURE: { indicatorKey: 'structure', label: 'Structure', decimals: 2 },
      ZONES: { indicatorKey: 'zones', label: 'Zones', decimals: 2 },
      VOLUME_PROFILE: { indicatorKey: 'volumeProfile', label: 'VP', decimals: 0 },
    }

    for (const [id, scale] of Object.entries(expected)) {
      expect(getRegisteredIndicatorDefinition(id)?.scale).toEqual(scale)
    }
  })

  it('creates generic scale renderers through stage 5B metadata', () => {
    const definition = getRegisteredIndicatorDefinition('WMA')
    expect(definition?.scale).toBeDefined()
  })
})
