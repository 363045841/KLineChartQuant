import { describe, expect, it } from 'vitest'
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
})
