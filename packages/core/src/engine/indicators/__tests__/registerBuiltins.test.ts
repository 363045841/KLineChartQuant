/** 验证仍由 core 提供的原生指标注册、渲染与配置契约。 */
import { beforeAll, describe, expect, it } from 'vitest'

import { makePluginLayerId } from '@/foundation/plugin/impl/rendererLayerId'
import {
  getRegisteredIndicatorDefinition,
  getRegisteredIndicatorDefinitions,
} from '../indicatorDefinitionRegistry'
import { loadBuiltinIndicators } from '../registerBuiltins'

beforeAll(async () => {
  await loadBuiltinIndicators()
})

describe('builtin indicator registration', () => {
  it('explicitly registers all builtin definitions with decorator metadata', () => {
    const definitions = getRegisteredIndicatorDefinitions()

    expect(new Set(definitions.map((definition) => definition.name)).size).toBe(definitions.length)
    expect(definitions.map((definition) => definition.name)).toEqual(
      expect.arrayContaining([
        'ma',
        'atr',
        'volume',
        'volumeProfile',
        'zones',
        'extremaMarkers',
        'lastPriceLine',
        'lastPriceLabelRegistrar',
        't3',
        'vidya',
        'frama',
        'dpo',
        'awesomeOscillator',
        'ultimateOscillator',
        'stochRSI',
        'fisherTransform',
        'schaffTrendCycle',
        'timeShare',
        'fiveDayTimeShare',
      ]),
    )
  })

  it('shares concurrent initialization without replacing registered definitions', async () => {
    const definitions = getRegisteredIndicatorDefinitions()
    await Promise.all([loadBuiltinIndicators(), loadBuiltinIndicators()])
    const reloaded = getRegisteredIndicatorDefinitions()
    expect(reloaded).toHaveLength(definitions.length)
    for (const definition of definitions) {
      expect(getRegisteredIndicatorDefinition(definition.name)).toBe(definition)
    }
  })

  it('allows builtin definitions to be queried by display name', () => {
    expect(getRegisteredIndicatorDefinition('CCI')?.name).toBe('cci')
    expect(getRegisteredIndicatorDefinition('ATR')?.name).toBe('atr')
    expect(getRegisteredIndicatorDefinition('VOL')?.name).toBe('volume')
  })

  it('keeps calculator params and presentation options disjoint', () => {
    for (const definition of getRegisteredIndicatorDefinitions()) {
      const runtime = definition.runtime
      const presentation = definition.presentation
      if (!runtime) continue
      const defaultParams =
        typeof runtime.defaultParams === 'function'
          ? runtime.defaultParams()
          : runtime.defaultParams
      const calculationKeys = new Set(Object.keys(defaultParams as Record<string, unknown>))
      expect(
        [...calculationKeys].filter((name) => name.startsWith('show') || /^ma\d+$/.test(name)),
        definition.name,
      ).toEqual([])
      if (!presentation) continue
      const presentationKeys = Object.keys(presentation.defaultOptions)
      expect(
        presentationKeys.filter((name) => calculationKeys.has(name)),
        definition.name,
      ).toEqual([])
    }

    expect(getRegisteredIndicatorDefinition('CCI')).toMatchObject({
      runtime: { defaultParams: { period: 14 } },
      presentation: { defaultOptions: { showCCI: true } },
    })
  })

  it('registers dedicated scale renderer factories for stage 5A indicators', () => {
    const expectedIndicators = ['VOL', 'CCI', 'KST', 'ATR']

    for (const id of expectedIndicators) {
      expect(getRegisteredIndicatorDefinition(id)?.scaleRendererFactory).toBeTypeOf('function')
    }
  })

  it('creates scale renderers through stage 5A metadata factories', () => {
    const rsiScaleRenderer = getRegisteredIndicatorDefinition('CCI')?.scaleRendererFactory?.({
      indicatorId: 'CCI',
      paneId: 'RSI_0',
      instanceId: 'rsi-instance',
      axisWidth: 80,
      yPaddingPx: 4,
      getCrosshair: () => null,
    })
    const volumeScaleRenderer = getRegisteredIndicatorDefinition('VOL')?.scaleRendererFactory?.({
      indicatorId: 'VOLUME',
      paneId: 'VOLUME_0',
      instanceId: 'volume-instance',
      axisWidth: 80,
      yPaddingPx: 4,
      getCrosshair: () => null,
    })

    expect(rsiScaleRenderer?.id).toBe(makePluginLayerId('cciScale_RSI_0'))
    expect(volumeScaleRenderer?.id).toBe(makePluginLayerId('volumeScale_VOLUME_0'))
  })

  it('registers generic scale metadata for stage 5B indicators', () => {
    const expected: Record<string, { indicatorKey: string; label: string; decimals: number }> = {
      DEMA: { indicatorKey: 'dema', label: 'DEMA', decimals: 2 },
      TEMA: { indicatorKey: 'tema', label: 'TEMA', decimals: 2 },
      HMA: { indicatorKey: 'hma', label: 'HMA', decimals: 2 },
      KAMA: { indicatorKey: 'kama', label: 'KAMA', decimals: 2 },
      SAR: { indicatorKey: 'sar', label: 'SAR', decimals: 4 },
      KELTNER: { indicatorKey: 'keltner', label: 'Keltner', decimals: 2 },
      ICHIMOKU: { indicatorKey: 'ichimoku', label: 'Ichimoku', decimals: 2 },
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
    const definition = getRegisteredIndicatorDefinition('DEMA')
    expect(definition?.scale).toBeDefined()
  })

  it('registers main pane renderer metadata for stage 6A-1 indicators', () => {
    const expected: Record<string, string> = {
      MA: 'ma',
      EXPMA: 'expma',
      ENE: 'ene',
    }

    for (const [id, rendererName] of Object.entries(expected)) {
      expect(
        getRegisteredIndicatorDefinition(id)?.getRendererName({ paneId: 'main', indicatorId: id }),
      ).toBe(rendererName)
    }
  })

  it('creates main pane renderers through stage 6A-1 metadata factories', () => {
    const maRenderer = getRegisteredIndicatorDefinition('MA')?.rendererFactory({
      paneId: 'main',
      indicatorId: 'MA',
      instanceId: 'main:MA',
    })
    const bollRenderer = getRegisteredIndicatorDefinition('ENE')?.rendererFactory({
      paneId: 'main',
      indicatorId: 'ENE',
      instanceId: 'main:BOLL',
    })

    expect(maRenderer?.id).toBe(makePluginLayerId('ma'))
    expect(bollRenderer?.id).toBe(makePluginLayerId('ene'))
  })

  it('resolves renderer names without creating renderer instances', () => {
    for (const definition of getRegisteredIndicatorDefinitions()) {
      const panes = definition.allowMainPane
        ? ['main', `sub_${definition.name}`]
        : [definition.category === 'main' ? 'main' : `sub_${definition.name}`]
      const ids = new Set<string>()
      for (const paneId of panes) {
        const options = {
          paneId,
          indicatorId: definition.name,
          instanceId: `${definition.name}-instance`,
        }
        const layer = definition.rendererFactory(options)
        expect(makePluginLayerId(definition.getRendererName(options))).toBe(layer.id)
        ids.add(layer.id)
      }
      expect(ids.size, definition.name).toBe(panes.length)
    }
  })

  it('registers main pane renderer metadata for stage 6A-2 indicators', () => {
    const expected: Record<string, string> = {
      DEMA: 'dema_main',
      TEMA: 'tema_main',
      HMA: 'hma_main',
      KAMA: 'kama_main',
      SAR: 'sar_main',
      KELTNER: 'keltner_main',
      ICHIMOKU: 'ichimoku_main',
      PIVOT: 'pivot_main',
      FIB: 'fib_main',
      STRUCTURE: 'structure_main',
      ZONES: 'zones_main',
    }

    for (const [id, rendererName] of Object.entries(expected)) {
      expect(
        getRegisteredIndicatorDefinition(id)?.getRendererName({ paneId: 'main', indicatorId: id }),
      ).toBe(rendererName)
    }
  })

  it('creates overlay main pane renderers through stage 6A-2 metadata factories', () => {
    const wma = getRegisteredIndicatorDefinition('DEMA')?.rendererFactory({
      paneId: 'main',
      indicatorId: 'DEMA',
      instanceId: 'main:WMA',
    })
    const zones = getRegisteredIndicatorDefinition('ZONES')?.rendererFactory({
      paneId: 'main',
      indicatorId: 'ZONES',
      instanceId: 'main:ZONES',
    })

    expect(wma?.id).toBe(makePluginLayerId('dema_main'))
    expect(zones?.id).toBe(makePluginLayerId('zones_main'))
  })

  it('registers overlay main config metadata for stage 6B-2 indicators', () => {
    const ids = [
      'DEMA',
      'TEMA',
      'HMA',
      'KAMA',
      'SAR',
      'KELTNER',
      'ICHIMOKU',
      'PIVOT',
      'FIB',
      'STRUCTURE',
      'ZONES',
    ]

    for (const id of ids) {
      expect(getRegisteredIndicatorDefinition(id)?.mainPane?.toActiveConfig).toBeTypeOf('function')
    }
  })

  it('builds overlay main active configs through stage 6B-2 metadata', () => {
    expect(
      getRegisteredIndicatorDefinition('DEMA')?.mainPane?.toActiveConfig?.({ period: 10 }, false),
    ).toEqual({
      period: 10,
      showDEMA: false,
    })

    expect(
      getRegisteredIndicatorDefinition('KELTNER')?.mainPane?.toActiveConfig?.(
        { emaPeriod: 20 },
        false,
      ),
    ).toEqual({
      emaPeriod: 20,
      showUpper: false,
      showMiddle: false,
      showLower: false,
    })

    expect(
      getRegisteredIndicatorDefinition('ICHIMOKU')?.mainPane?.toActiveConfig?.({}, false),
    ).toEqual({
      showTenkan: false,
      showKijun: false,
      showSpanA: false,
      showSpanB: false,
      showChikou: false,
      showCloud: false,
    })

    expect(
      getRegisteredIndicatorDefinition('ZONES')?.mainPane?.toActiveConfig?.({}, false),
    ).toEqual({
      showFVG: false,
      showOB: false,
      showFilledZones: false,
    })
  })

  it('registers base main config metadata for stage 6B-1 indicators', () => {
    for (const id of ['MA', 'EXPMA', 'ENE']) {
      const definition = getRegisteredIndicatorDefinition(id)
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
    expect(
      getRegisteredIndicatorDefinition('EXPMA')?.mainPane?.toActiveConfig?.({}, false),
    ).toBeNull()
    expect(
      getRegisteredIndicatorDefinition('ENE')?.mainPane?.toActiveConfig?.({}, false),
    ).toBeNull()
  })

  it('主图指标通过 Plot 声明价格序列', () => {
    for (const id of ['MA', 'EXPMA', 'ENE']) {
      expect(getRegisteredIndicatorDefinition(id)?.plots?.series.length).toBeGreaterThan(0)
    }
  })

  it('主图指标不再声明专用渲染状态投影', () => {
    for (const id of ['MA', 'EXPMA', 'ENE']) {
      expect(getRegisteredIndicatorDefinition(id)?.plots?.series).toBeInstanceOf(Array)
    }
  })

  it('单线指标声明 Plot', () => {
    for (const id of ['DEMA', 'TEMA', 'HMA', 'KAMA', 'ChaikinVol', 'OBV', 'PVT', 'VWAP']) {
      expect(getRegisteredIndicatorDefinition(id)?.plots?.series).toBeInstanceOf(Array)
    }
  })

  it('振荡指标声明 Plot', () => {
    for (const id of ['MFI', 'CMF']) {
      expect(getRegisteredIndicatorDefinition(id)?.plots?.series).toBeInstanceOf(Array)
    }
  })

  it('动量与波动指标声明 Plot', () => {
    for (const id of ['KST', 'ATR', 'HV', 'PARKINSON', 'VMA', 'TRIX']) {
      expect(getRegisteredIndicatorDefinition(id)?.plots?.series).toBeInstanceOf(Array)
    }
  })

  it('叠加指标声明 Plot', () => {
    for (const id of ['SAR', 'KELTNER', 'ICHIMOKU', 'PIVOT', 'FIB']) {
      expect(getRegisteredIndicatorDefinition(id)?.plots?.series).toBeInstanceOf(Array)
    }
  })

  it('registers visible state composer metadata for stage 8C-D2-B structure indicators', () => {
    for (const id of ['STRUCTURE', 'ZONES', 'VOLUME_PROFILE']) {
      expect(getRegisteredIndicatorDefinition(id)?.customState?.compose).toBeTypeOf('function')
    }
  })

  it('registers visible state composer metadata for all composed visible sub indicators', () => {
    const ids = [
      'CCI',
      'ATR',
      'DEMA',
      'TEMA',
      'HMA',
      'KAMA',
      'SAR',
      'KELTNER',
      'ICHIMOKU',
      'TRIX',
      'HV',
      'PARKINSON',
      'CHAIKIN_VOL',
      'VMA',
      'OBV',
      'PVT',
      'VWAP',
      'CMF',
      'MFI',
      'KST',
      'PIVOT',
      'FIB',
      'STRUCTURE',
      'ZONES',
      'VOLUME_PROFILE',
    ]

    for (const id of ids) {
      const definition = getRegisteredIndicatorDefinition(id)
      expect(definition?.plots ?? definition?.customState).toBeDefined()
    }
  })
})
