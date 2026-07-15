import { describe, expect, it, vi, beforeAll } from 'vitest'

import type { RendererPluginWithHost } from '../../../../foundation/plugin'
import type { IndicatorMetadata } from '../../../indicators/indicatorMetadata'
import { IndicatorRegistry } from '../../../indicators/indicatorRegistry'
import {
  getBuiltinIndicatorDefinitions,
  loadBuiltinIndicators,
} from '../../../indicators/registerBuiltins'
import { createSubIndicatorRenderer } from '../index'

beforeAll(async () => {
  await loadBuiltinIndicators()
})

function createRenderer(name: string): RendererPluginWithHost {
  return {
    name,
    version: '1.0.0',
    description: 'test renderer',
    paneId: 'test',
    priority: 0,
    draw: vi.fn(),
  }
}

describe('createSubIndicatorRenderer', () => {
  it('creates renderers through registered indicator metadata', () => {
    const rendererFactory = vi.fn(() => createRenderer('custom_renderer'))
    const definition: IndicatorMetadata = {
      name: 'customIndicator',
      displayName: 'CUSTOM',
      category: 'sub',
      stateKey: (paneId: string) => `indicator:custom:${paneId}`,
      defaultPaneId: 'sub_CUSTOM',
      rendererFactory,
    }

    const renderer = createSubIndicatorRenderer({
      indicatorId: 'CUSTOM',
      paneId: 'sub_CUSTOM',
      definition,
      params: { period: 12 },
    })

    expect(renderer.name).toBe('custom_renderer')
    expect(rendererFactory).toHaveBeenCalledWith({
      indicatorId: 'CUSTOM',
      paneId: 'sub_CUSTOM',
      params: { period: 12 },
    })
  })

  it('supports legacy uppercase ids through registry normalization', () => {
    const registry = new IndicatorRegistry(false)
    for (const definition of getBuiltinIndicatorDefinitions()) {
      registry.register(definition)
    }

    const definition = registry.getRequired('VOLUME_PROFILE')
    const renderer = createSubIndicatorRenderer({
      indicatorId: 'VOLUME_PROFILE',
      paneId: 'VOLUME_PROFILE_0',
      definition,
    })

    expect(definition.name).toBe('volumeProfile')
    expect(renderer.name).toBe('volumeProfile_VOLUME_PROFILE_0')
  })
})
