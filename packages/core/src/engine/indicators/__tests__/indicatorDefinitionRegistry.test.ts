/** 验证声明与装配分离、目录冲突原子性和身份解析。 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearRegisteredIndicatorDefinitionsForTest,
  getRegisteredIndicatorDefinition,
  getRegisteredIndicatorDefinitions,
  Indicator,
  registerIndicatorDefinition,
  resolveIndicatorLayerId,
} from '../indicatorDefinitionRegistry'
import { IndicatorKind } from '../indicatorMetadata'
import { createTestRendererLayer } from './helpers/metadataTestKit'

/** 声明带别名的真实 Layer 定义，注册由调用方决定。 */
function declareDefinition(name: string, alias: string) {
  @Indicator({
    name,
    aliases: [alias],
    displayName: name,
    kind: IndicatorKind.Indicator,
    category: 'oscillator',
    indicatorType: 'momentum',
    defaultPaneId: `sub_${alias}`,
    scale: { indicatorKey: name },
  })
  class Definition {
    static rendererFactory = () => createTestRendererLayer(name)
  }
  return Definition
}

describe('Indicator definition registry', () => {
  beforeEach(clearRegisteredIndicatorDefinitionsForTest)

  it('declares without mutating the directory, then registers idempotently', () => {
    const Definition = declareDefinition('customRsi', 'CUSTOM_RSI')
    expect(getRegisteredIndicatorDefinitions()).toEqual([])
    registerIndicatorDefinition(Definition)
    registerIndicatorDefinition(Definition)
    const definition = getRegisteredIndicatorDefinition('CUSTOM_RSI')
    expect(definition?.name).toBe('customRsi')
    expect(getRegisteredIndicatorDefinition('custom rsi')).toBe(definition)
    expect(getRegisteredIndicatorDefinitions()).toHaveLength(1)
    expect(resolveIndicatorLayerId('CUSTOM_RSI', 'pane')).toBe('plugin:customRsi_pane')
    expect(resolveIndicatorLayerId('CUSTOM_RSI', 'pane', 'scale')).toBe(
      'plugin:customRsiScale_pane',
    )
  })

  it('can assemble the same declaration after clearing the directory', () => {
    const Definition = declareDefinition('customMacd', 'CUSTOM_MACD')
    registerIndicatorDefinition(Definition)
    clearRegisteredIndicatorDefinitionsForTest()
    expect(getRegisteredIndicatorDefinitions()).toEqual([])
    registerIndicatorDefinition(Definition)
    expect(getRegisteredIndicatorDefinition('CUSTOM_MACD')).toBeDefined()
  })

  it('rejects duplicate names and aliases without changing the existing directory', () => {
    const Original = declareDefinition('customRsi', 'OLD_RSI')
    registerIndicatorDefinition(Original)
    const original = getRegisteredIndicatorDefinition('customRsi')
    expect(() => registerIndicatorDefinition(declareDefinition('customRsi', 'NEW_RSI'))).toThrow(
      'already registered',
    )
    expect(() => registerIndicatorDefinition(declareDefinition('other', 'OLD_RSI'))).toThrow(
      'alias is already registered',
    )
    expect(getRegisteredIndicatorDefinition('customRsi')).toBe(original)
    expect(getRegisteredIndicatorDefinition('other')).toBeUndefined()
    expect(getRegisteredIndicatorDefinition('NEW_RSI')).toBeUndefined()
    expect(getRegisteredIndicatorDefinitions()).toHaveLength(1)
  })

  it('rejects undeclared classes and unknown Layer identities', () => {
    class Undeclared {}
    expect(() => registerIndicatorDefinition(Undeclared)).toThrow('must declare @Indicator')
    expect(() => resolveIndicatorLayerId('missing', 'main')).toThrow('missing renderer identity')
  })
})
