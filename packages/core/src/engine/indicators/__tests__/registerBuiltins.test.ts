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
})
