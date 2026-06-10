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
      updateIndicatorConfig: vi.fn(),
    }

    getRegisteredIndicatorDefinition('RSI')?.updateConfig?.(scheduler, { period1: 7 }, 'RSI_0')
    getRegisteredIndicatorDefinition('MACD')?.updateConfig?.(scheduler, { fastPeriod: 8 }, 'MACD_0')
    getRegisteredIndicatorDefinition('VOLUME_PROFILE')?.updateConfig?.(scheduler, { bins: 32 }, 'VP_0')
    getRegisteredIndicatorDefinition('VOL')?.updateConfig?.(scheduler, {}, 'VOL_0')

    expect(scheduler.updateIndicatorConfig).toHaveBeenCalledWith('rsi', { period1: 7 }, 'RSI_0')
    expect(scheduler.updateIndicatorConfig).toHaveBeenCalledWith('macd', { fastPeriod: 8 }, 'MACD_0')
    expect(scheduler.updateIndicatorConfig).toHaveBeenCalledWith('volumeProfile', { bins: 32 }, 'VP_0')
  })

  it('routes stage 4B metadata config updates to scheduler methods', () => {
    const scheduler = {
      updateIndicatorConfig: vi.fn(),
    }

    getRegisteredIndicatorDefinition('CCI')?.updateConfig?.(scheduler, { period: 14 }, 'CCI_0')
    getRegisteredIndicatorDefinition('ATR')?.updateConfig?.(scheduler, { period: 10 }, 'ATR_0')
    getRegisteredIndicatorDefinition('CHAIKIN_VOL')?.updateConfig?.(scheduler, { emaPeriod: 10 }, 'CV_0')
    getRegisteredIndicatorDefinition('ZONES')?.updateConfig?.(scheduler, { showFVG: true }, 'Z_0')

    expect(scheduler.updateIndicatorConfig).toHaveBeenCalledWith('cci', { period: 14 }, 'CCI_0')
    expect(scheduler.updateIndicatorConfig).toHaveBeenCalledWith('atr', { period: 10 }, 'ATR_0')
    expect(scheduler.updateIndicatorConfig).toHaveBeenCalledWith('chaikinVol', { emaPeriod: 10 }, 'CV_0')
    expect(scheduler.updateIndicatorConfig).toHaveBeenCalledWith('zones', { showFVG: true }, 'Z_0')
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

  it('registers main pane renderer metadata for stage 6A-1 indicators', () => {
    const expected: Record<string, string> = {
      MA: 'ma',
      BOLL: 'boll',
      EXPMA: 'expma',
      ENE: 'ene',
    }

    for (const [id, rendererName] of Object.entries(expected)) {
      expect(getRegisteredIndicatorDefinition(id)?.mainPane?.rendererName).toBe(rendererName)
    }
  })

  it('creates main pane renderers through stage 6A-1 metadata factories', () => {
    const maRenderer = getRegisteredIndicatorDefinition('MA')?.rendererFactory({ paneId: 'main', indicatorId: 'MA' })
    const bollRenderer = getRegisteredIndicatorDefinition('BOLL')?.rendererFactory({ paneId: 'main', indicatorId: 'BOLL' })

    expect(maRenderer?.name).toBe('ma')
    expect(bollRenderer?.name).toBe('boll')
  })

  it('registers main pane renderer metadata for stage 6A-2 indicators', () => {
    const expected: Record<string, string> = {
      WMA: 'wma_main',
      DEMA: 'dema_main',
      TEMA: 'tema_main',
      HMA: 'hma_main',
      KAMA: 'kama_main',
      SAR: 'sar_main',
      SUPERTREND: 'supertrend_main',
      KELTNER: 'keltner_main',
      DONCHIAN: 'donchian_main',
      ICHIMOKU: 'ichimoku_main',
      PIVOT: 'pivot_main',
      FIB: 'fib_main',
      STRUCTURE: 'structure_main',
      ZONES: 'zones_main',
    }

    for (const [id, rendererName] of Object.entries(expected)) {
      expect(getRegisteredIndicatorDefinition(id)?.mainPane?.rendererName).toBe(rendererName)
    }
  })

  it('creates overlay main pane renderers through stage 6A-2 metadata factories', () => {
    const wma = getRegisteredIndicatorDefinition('WMA')?.rendererFactory({ paneId: 'main', indicatorId: 'WMA' })
    const zones = getRegisteredIndicatorDefinition('ZONES')?.rendererFactory({ paneId: 'main', indicatorId: 'ZONES' })

    expect(wma?.name).toBe('wma_main')
    expect(zones?.name).toBe('zones_main')
  })

  it('registers overlay main config metadata for stage 6B-2 indicators', () => {
    const ids = [
      'WMA', 'DEMA', 'TEMA', 'HMA', 'KAMA',
      'SAR', 'SUPERTREND', 'KELTNER', 'DONCHIAN',
      'ICHIMOKU', 'PIVOT', 'FIB', 'STRUCTURE', 'ZONES',
    ]

    for (const id of ids) {
      expect(getRegisteredIndicatorDefinition(id)?.mainPane?.toActiveConfig).toBeTypeOf('function')
    }
  })

  it('builds overlay main active configs through stage 6B-2 metadata', () => {
    expect(getRegisteredIndicatorDefinition('WMA')?.mainPane?.toActiveConfig?.({ period: 10 }, false)).toEqual({
      period: 10, showWMA: false,
    })

    expect(getRegisteredIndicatorDefinition('KELTNER')?.mainPane?.toActiveConfig?.({ emaPeriod: 20 }, false)).toEqual({
      emaPeriod: 20, showUpper: false, showMiddle: false, showLower: false,
    })

    expect(getRegisteredIndicatorDefinition('ICHIMOKU')?.mainPane?.toActiveConfig?.({}, false)).toEqual({
      showTenkan: false, showKijun: false, showSpanA: false,
      showSpanB: false, showChikou: false, showCloud: false,
    })

    expect(getRegisteredIndicatorDefinition('ZONES')?.mainPane?.toActiveConfig?.({}, false)).toEqual({
      showFVG: false, showOB: false, showFilledZones: false,
    })
  })

  it('registers base main config metadata for stage 6B-1 indicators', () => {
    for (const id of ['MA', 'BOLL', 'EXPMA', 'ENE']) {
      const definition = getRegisteredIndicatorDefinition(id)
      expect(definition?.updateConfig).toBeTypeOf('function')
      expect(definition?.mainPane?.toActiveConfig).toBeTypeOf('function')
    }
  })

  it('builds base main active configs through stage 6B-1 metadata', () => {
    expect(getRegisteredIndicatorDefinition('MA')?.mainPane?.toActiveConfig?.({}, false)).toEqual({
      ma5: false,
      ma10: false,
      ma20: false,
      ma30: false,
      ma60: false,
    })
    expect(getRegisteredIndicatorDefinition('BOLL')?.mainPane?.toActiveConfig?.({ period: 20 }, false)).toEqual({
      period: 20,
      showUpper: false,
      showMiddle: false,
      showLower: false,
      showBand: false,
    })
    expect(getRegisteredIndicatorDefinition('EXPMA')?.mainPane?.toActiveConfig?.({}, false)).toBeNull()
    expect(getRegisteredIndicatorDefinition('ENE')?.mainPane?.toActiveConfig?.({}, false)).toBeNull()
  })

  it('routes base main metadata config updates to scheduler methods', () => {
    const scheduler = {
      updateIndicatorConfig: vi.fn(),
    }

    getRegisteredIndicatorDefinition('MA')?.updateConfig?.(scheduler, { ma5: true }, 'main')
    getRegisteredIndicatorDefinition('BOLL')?.updateConfig?.(scheduler, { period: 20 }, 'main')
    getRegisteredIndicatorDefinition('EXPMA')?.updateConfig?.(scheduler, { fastPeriod: 12 }, 'main')
    getRegisteredIndicatorDefinition('ENE')?.updateConfig?.(scheduler, { period: 10 }, 'main')

    expect(scheduler.updateIndicatorConfig).toHaveBeenCalledWith('ma', { ma5: true }, 'main')
    expect(scheduler.updateIndicatorConfig).toHaveBeenCalledWith('boll', { period: 20 }, 'main')
    expect(scheduler.updateIndicatorConfig).toHaveBeenCalledWith('expma', { fastPeriod: 12 }, 'main')
    expect(scheduler.updateIndicatorConfig).toHaveBeenCalledWith('ene', { period: 10 }, 'main')
  })

  it('registers semantic apply metadata for stage 7A main indicators', () => {
    for (const id of ['MA', 'BOLL', 'EXPMA', 'ENE']) {
      expect(getRegisteredIndicatorDefinition(id)?.semantic?.apply).toBeTypeOf('function')
    }
  })

  it('routes semantic main indicator configs through stage 7A metadata', () => {
    const chart = { updateRendererConfig: vi.fn() }

    getRegisteredIndicatorDefinition('MA')?.semantic?.apply?.(chart, {
      type: 'MA',
      enabled: true,
      params: { periods: [5, 20, 99] },
    })
    getRegisteredIndicatorDefinition('BOLL')?.semantic?.apply?.(chart, {
      type: 'BOLL',
      enabled: true,
      params: { period: 21, multiplier: 2.5 },
    })
    getRegisteredIndicatorDefinition('EXPMA')?.semantic?.apply?.(chart, {
      type: 'EXPMA',
      enabled: true,
      params: {},
    })
    getRegisteredIndicatorDefinition('ENE')?.semantic?.apply?.(chart, {
      type: 'ENE',
      enabled: true,
    })

    expect(chart.updateRendererConfig).toHaveBeenCalledWith('ma', { ma5: true, ma20: true })
    expect(chart.updateRendererConfig).toHaveBeenCalledWith('boll', { period: 21, multiplier: 2.5 })
    expect(chart.updateRendererConfig).toHaveBeenCalledWith('expma', { fastPeriod: 12, slowPeriod: 50 })
    expect(chart.updateRendererConfig).toHaveBeenCalledWith('ene', { period: 10, deviation: 11 })
  })

  it('registers main pane price range metadata for stage 8A indicators', () => {
    for (const id of ['MA', 'BOLL', 'EXPMA', 'ENE']) {
      expect(getRegisteredIndicatorDefinition(id)?.mainPane?.computePriceRange).toBeTypeOf('function')
    }
  })

  it('registers main pane render state composer metadata for stage 8B indicators', () => {
    for (const id of ['MA', 'BOLL', 'EXPMA', 'ENE']) {
      expect(getRegisteredIndicatorDefinition(id)?.mainPane?.composeRenderState).toBeTypeOf('function')
    }
  })

  it('registers visible state composer metadata for stage 8C-A indicators', () => {
    for (const id of ['WMA', 'DEMA', 'TEMA', 'HMA', 'KAMA', 'ROC', 'ChaikinVol', 'OBV', 'PVT', 'VWAP']) {
      expect(getRegisteredIndicatorDefinition(id)?.visibleState?.compose).toBeTypeOf('function')
    }
  })

  it('registers visible state composer metadata for stage 8C-B indicators', () => {
    for (const id of ['RSI', 'STOCH', 'FASTK', 'MFI', 'WMSR', 'CMF']) {
      expect(getRegisteredIndicatorDefinition(id)?.visibleState?.compose).toBeTypeOf('function')
    }
  })

  it('registers visible state composer metadata for stage 8C-C indicators', () => {
    for (const id of ['MOM', 'KST', 'ATR', 'HV', 'PARKINSON', 'VMA', 'TRIX']) {
      expect(getRegisteredIndicatorDefinition(id)?.visibleState?.compose).toBeTypeOf('function')
    }
  })

  it('registers visible state composer metadata for stage 8C-D1 MACD indicator', () => {
    expect(getRegisteredIndicatorDefinition('MACD')?.visibleState?.compose).toBeTypeOf('function')
  })

  it('registers visible state composer metadata for stage 8C-D2 overlay indicators', () => {
    for (const id of ['SAR', 'SUPERTREND', 'KELTNER', 'DONCHIAN', 'ICHIMOKU', 'PIVOT', 'FIB']) {
      expect(getRegisteredIndicatorDefinition(id)?.visibleState?.compose).toBeTypeOf('function')
    }
  })

  it('registers visible state composer metadata for stage 8C-D2-B structure indicators', () => {
    for (const id of ['STRUCTURE', 'ZONES', 'VOLUME_PROFILE']) {
      expect(getRegisteredIndicatorDefinition(id)?.visibleState?.compose).toBeTypeOf('function')
    }
  })

  it('registers visible state composer metadata for all composed visible sub indicators', () => {
    const ids = [
      'RSI', 'CCI', 'STOCH', 'MOM', 'WMSR', 'FASTK', 'MACD',
      'ATR', 'WMA', 'DEMA', 'TEMA', 'HMA', 'KAMA',
      'SAR', 'SUPERTREND', 'KELTNER', 'DONCHIAN', 'ICHIMOKU',
      'ROC', 'TRIX', 'HV', 'PARKINSON', 'CHAIKIN_VOL',
      'VMA', 'OBV', 'PVT', 'VWAP', 'CMF', 'MFI',
      'KST', 'PIVOT', 'FIB', 'STRUCTURE', 'ZONES', 'VOLUME_PROFILE',
    ]

    for (const id of ids) {
      expect(getRegisteredIndicatorDefinition(id)?.visibleState?.compose).toBeTypeOf('function')
    }
  })
})
