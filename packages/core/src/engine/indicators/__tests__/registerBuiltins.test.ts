/** 验证剩余原生定义的注册一致性和渲染身份。 */
import { beforeAll, describe, expect, it } from 'vitest'
import { makePluginLayerId } from '@/foundation/plugin/impl/rendererLayerId'
import {
  getRegisteredIndicatorDefinition,
  getRegisteredIndicatorDefinitions,
} from '../indicatorDefinitionRegistry'
import { IndicatorKind } from '../indicatorMetadata'
import { loadBuiltinIndicators } from '../registerBuiltins'

/** Core 只保留系统定义；纯数值指标全部由 Script 包提供。 */
const SYSTEM_INDICATOR_NAMES = [
  'extremaMarkers',
  'fiveDayTimeShare',
  'lastPriceLabelRegistrar',
  'lastPriceLine',
  'timeShare',
]

beforeAll(loadBuiltinIndicators)

describe('builtin indicator registration', () => {
  it('explicitly registers every system definition with decorator metadata', () => {
    const definitions = getRegisteredIndicatorDefinitions()
    expect(definitions.map((definition) => definition.name).sort()).toEqual(
      [...SYSTEM_INDICATOR_NAMES].sort(),
    )
    for (const definition of definitions) {
      expect(definition.kind, definition.name).toBe(IndicatorKind.System)
    }
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
})
