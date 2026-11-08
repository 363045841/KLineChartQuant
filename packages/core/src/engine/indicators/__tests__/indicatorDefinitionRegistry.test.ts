/** 验证声明与装配分离、目录冲突原子性和身份解析。 */
import { beforeEach, describe, expect, it } from 'vitest'
import { Indicator } from '../indicatorDecorator'
import {
  clearRegisteredIndicatorDefinitionsForTest,
  getIndicatorDescriptor,
  getRegisteredIndicatorDefinition,
  getRegisteredIndicatorDefinitions,
  registerIndicatorDefinition,
  resolveIndicatorLayerId,
  updateIndicatorDefinition,
} from '../indicatorDefinitionRegistry'
import { IndicatorKind } from '../indicatorMetadata'
import { createTestRendererLayer } from './helpers/metadataTestKit'

/** 声明带别名的真实 Layer 定义，注册由调用方决定。 */
function declareDefinition(name: string, alias: string, scriptDisplayName?: string) {
  @Indicator({
    name,
    aliases: [alias],
    displayName: scriptDisplayName ?? name,
    source: scriptDisplayName === undefined ? 'native' : 'script',
    kind: IndicatorKind.Indicator,
    category: 'oscillator',
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
    expect(resolveIndicatorLayerId('CUSTOM_RSI', 'pane', { part: 'scale' })).toBe(
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

  it('rejects a script rename that collides with another identity without changing the registry', () => {
    registerIndicatorDefinition(declareDefinition('script_alpha', 'alpha_alias', 'Alpha'))
    registerIndicatorDefinition(declareDefinition('script_beta', 'beta_alias', 'Beta'))

    // 展示名与其它定义冲突时拒绝，目录保持原状。
    expect(() =>
      updateIndicatorDefinition(declareDefinition('script_alpha', 'alpha_alias', 'Beta')),
    ).toThrow('alias is already registered')
    expect(getRegisteredIndicatorDefinition('Alpha')?.displayName).toBe('Alpha')
    expect(getRegisteredIndicatorDefinition('Beta')?.displayName).toBe('Beta')
  })

  it('多实例声明同时进入静态目录与运行期元数据', () => {
    @Indicator({
      name: 'customMultiLine',
      displayName: 'MULTI_LINE',
      kind: IndicatorKind.Indicator,
      category: 'main',
      defaultPaneId: 'main',
      allowMainPane: true,
      multiInstance: true,
    })
    class MultiLineDefinition {
      static rendererFactory = () => createTestRendererLayer('customMultiLine')
    }
    registerIndicatorDefinition(MultiLineDefinition)
    expect(getIndicatorDescriptor('customMultiLine')?.multiInstance).toBe(true)
    const multi = getRegisteredIndicatorDefinition('customMultiLine')
    expect(multi?.multiInstance).toBe(true)
    // 声明多实例后，渲染层身份叠加实例 id；未声明时忽略实例 id，保持原有层身份。
    expect(multi?.getRendererName({ paneId: 'main', indicatorId: 'customMultiLine' })).toBe(
      'customMultiLine_main',
    )
    expect(
      multi?.getRendererName({ paneId: 'main', indicatorId: 'customMultiLine', instanceId: 'abc' }),
    ).toBe('customMultiLine_main_abc')

    registerIndicatorDefinition(declareDefinition('customSingle', 'SINGLE_ALIAS'))
    expect(
      getRegisteredIndicatorDefinition('customSingle')?.getRendererName({
        paneId: 'pane',
        indicatorId: 'customSingle',
        instanceId: 'abc',
      }),
    ).toBe('customSingle_pane')
  })
})
