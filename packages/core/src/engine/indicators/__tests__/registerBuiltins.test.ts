/** 验证剩余原生定义的注册一致性和渲染身份。 */
import { beforeAll, describe, expect, it } from 'vitest'
import { makePluginLayerId } from '@/foundation/plugin/impl/rendererLayerId'
import {
  getRegisteredIndicatorDefinition,
  getRegisteredIndicatorDefinitions,
} from '../indicatorDefinitionRegistry'
import { loadBuiltinIndicators } from '../registerBuiltins'

beforeAll(loadBuiltinIndicators)

describe('builtin indicator registration', () => {
  it('explicitly registers all builtin definitions with decorator metadata', () => {
    const definitions = getRegisteredIndicatorDefinitions()
    expect(new Set(definitions.map((definition) => definition.name)).size).toBe(definitions.length)
    expect(definitions.map((definition) => definition.name)).toEqual(
      expect.arrayContaining([
        'volumeProfile',
        'zones',
        'extremaMarkers',
        'lastPriceLine',
        'lastPriceLabelRegistrar',
        'vidya',
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

  it('keeps calculator params and presentation options disjoint', () => {
    for (const definition of getRegisteredIndicatorDefinitions()) {
      const runtime = definition.runtime
      if (!runtime) continue
      const calculationKeys = new Set(Object.keys(runtime.defaultParams))
      expect(
        [...calculationKeys].filter((name) => name.startsWith('show')),
        definition.name,
      ).toEqual([])
      if (!definition.presentation) continue
      expect(
        Object.keys(definition.presentation.defaultOptions).filter((name) =>
          calculationKeys.has(name),
        ),
        definition.name,
      ).toEqual([])
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

  it('振荡指标声明 Plot', () => {
    for (const id of ['schaffTrendCycle', 'stochRSI']) {
      expect(getRegisteredIndicatorDefinition(id)?.plots?.series).toBeInstanceOf(Array)
    }
  })

  it('registers visible state composer metadata for structure indicators', () => {
    for (const id of ['STRUCTURE', 'ZONES', 'VOLUME_PROFILE']) {
      expect(getRegisteredIndicatorDefinition(id)?.customState?.compose).toBeTypeOf('function')
    }
  })
})
