/** 验证注解自动注册，以及别名、重复装配和清理后的重注册行为。 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearRegisteredIndicatorDefinitionsForTest,
  getRegisteredIndicatorDefinition,
  getRegisteredIndicatorDefinitions,
  Indicator,
  registerIndicatorDefinition,
} from '../indicatorDefinitionRegistry'
import { IndicatorKind } from '../indicatorMetadata'

/** 注册一个仅用于目录解析的第三方指标定义；name 为任意字符串，无需并入契约。 */
function declareDefinition(name: string, alias: string) {
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

  return Definition
}

describe('Indicator definition registry', () => {
  beforeEach(() => {
    clearRegisteredIndicatorDefinitionsForTest()
  })

  it('automatically registers decorated definitions and resolves aliases case-insensitively', () => {
    const Definition = declareDefinition('customRsi', 'CUSTOM_RSI')
    expect(getRegisteredIndicatorDefinition('CUSTOM_RSI')?.name).toBe('customRsi')
    registerIndicatorDefinition(Definition)

    const definition = getRegisteredIndicatorDefinition('CUSTOM_RSI')

    expect(definition?.name).toBe('customRsi')
    expect(getRegisteredIndicatorDefinition('custom rsi')).toBe(definition)
    expect(getRegisteredIndicatorDefinition('customrsi')).toBe(definition)
    expect(getRegisteredIndicatorDefinitions()).toHaveLength(1)
  })

  it('clears registered definitions and aliases for tests', () => {
    const Definition = declareDefinition('customMacd', 'CUSTOM_MACD')
    registerIndicatorDefinition(Definition)

    expect(getRegisteredIndicatorDefinition('CUSTOM_MACD')).toBeDefined()

    clearRegisteredIndicatorDefinitionsForTest()

    expect(getRegisteredIndicatorDefinition('CUSTOM_MACD')).toBeUndefined()
    expect(getRegisteredIndicatorDefinitions()).toEqual([])
    registerIndicatorDefinition(Definition)
    expect(getRegisteredIndicatorDefinition('CUSTOM_MACD')).toBeDefined()
  })

  it('does not overwrite a replacement when the original class is registered again', () => {
    const Original = declareDefinition('customRsi', 'OLD_RSI')
    const Replacement = declareDefinition('customRsi', 'NEW_RSI')
    registerIndicatorDefinition(Original)
    registerIndicatorDefinition(Replacement)
    const replacement = getRegisteredIndicatorDefinition('NEW_RSI')
    registerIndicatorDefinition(Original)
    expect(getRegisteredIndicatorDefinition('customRsi')).toBe(replacement)
    expect(getRegisteredIndicatorDefinition('OLD_RSI')).toBeUndefined()
    expect(getRegisteredIndicatorDefinitions()).toHaveLength(1)
  })

  it('rejects classes without decorator metadata', () => {
    class Undeclared {}
    expect(() => registerIndicatorDefinition(Undeclared)).toThrow('must declare @Indicator')
  })
})
