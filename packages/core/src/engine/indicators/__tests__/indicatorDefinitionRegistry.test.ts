import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  clearRegisteredIndicatorDefinitionsForTest,
  getRegisteredIndicatorDefinition,
  getRegisteredIndicatorDefinitions,
  Indicator,
} from '../indicatorDefinitionRegistry'

describe('Indicator definition registry', () => {
  beforeEach(() => {
    clearRegisteredIndicatorDefinitionsForTest()
  })

  it('collects decorated definitions and resolves aliases case-insensitively', () => {
    @Indicator({
      name: 'customRsi',
      aliases: ['CUSTOM_RSI'],
      displayName: 'Custom RSI',
      category: 'oscillator',
      stateKey: (paneId: string) => `indicator:customRsi:${paneId}`,
      defaultPaneId: 'sub_CUSTOM_RSI',
    })
    class CustomRsiDefinition {
      static rendererFactory = vi.fn() as any
    }

    void CustomRsiDefinition

    const definition = getRegisteredIndicatorDefinition('CUSTOM_RSI')

    expect(definition?.name).toBe('customRsi')
    expect(getRegisteredIndicatorDefinition('custom rsi')).toBe(definition)
    expect(getRegisteredIndicatorDefinition('customrsi')).toBe(definition)
    expect(getRegisteredIndicatorDefinitions()).toHaveLength(1)
  })

  it('clears registered definitions and aliases for tests', () => {
    @Indicator({
      name: 'customMacd',
      aliases: ['CUSTOM_MACD'],
      displayName: 'Custom MACD',
      category: 'oscillator',
      stateKey: (paneId: string) => `indicator:customMacd:${paneId}`,
      defaultPaneId: 'sub_CUSTOM_MACD',
    })
    class CustomMacdDefinition {
      static rendererFactory = vi.fn() as any
    }

    void CustomMacdDefinition

    expect(getRegisteredIndicatorDefinition('CUSTOM_MACD')).toBeDefined()

    clearRegisteredIndicatorDefinitionsForTest()

    expect(getRegisteredIndicatorDefinition('CUSTOM_MACD')).toBeUndefined()
    expect(getRegisteredIndicatorDefinitions()).toEqual([])
  })
})
