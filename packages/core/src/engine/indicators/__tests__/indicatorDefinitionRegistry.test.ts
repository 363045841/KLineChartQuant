import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearRegisteredIndicatorDefinitionsForTest,
  getRegisteredIndicatorDefinition,
  getRegisteredIndicatorDefinitions,
  Indicator,
} from '../indicatorDefinitionRegistry'
import { IndicatorKind } from '../indicatorMetadata'

/** 注册一个仅用于目录解析的第三方指标定义；name 为任意字符串，无需并入契约。 */
function registerDefinition(name: string, alias: string): void {
  @Indicator({
    name,
    aliases: [alias],
    displayName: name,
    kind: IndicatorKind.Indicator,
    category: 'oscillator',
    indicatorType: 'momentum',
    defaultPaneId: `sub_${alias}`,
  })
  class Definition {
    static rendererFactory = vi.fn()
  }

  void Definition
}

describe('Indicator definition registry', () => {
  beforeEach(() => {
    clearRegisteredIndicatorDefinitionsForTest()
  })

  it('collects decorated definitions and resolves aliases case-insensitively', () => {
    registerDefinition('customRsi', 'CUSTOM_RSI')

    const definition = getRegisteredIndicatorDefinition('CUSTOM_RSI')

    expect(definition?.name).toBe('customRsi')
    expect(getRegisteredIndicatorDefinition('custom rsi')).toBe(definition)
    expect(getRegisteredIndicatorDefinition('customrsi')).toBe(definition)
    expect(getRegisteredIndicatorDefinitions()).toHaveLength(1)
  })

  it('clears registered definitions and aliases for tests', () => {
    registerDefinition('customMacd', 'CUSTOM_MACD')

    expect(getRegisteredIndicatorDefinition('CUSTOM_MACD')).toBeDefined()

    clearRegisteredIndicatorDefinitionsForTest()

    expect(getRegisteredIndicatorDefinition('CUSTOM_MACD')).toBeUndefined()
    expect(getRegisteredIndicatorDefinitions()).toEqual([])
  })
})
