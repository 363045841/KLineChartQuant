/**
 * createSubIndicatorRenderer 测试：rendererFactory 装配与实例身份透传。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createTestIndicatorMetadata,
  createTestRendererPlugin,
} from '../../../indicators/__tests__/helpers/metadataTestKit'
import { getRegisteredIndicatorDefinition } from '../../../indicators/indicatorDefinitionRegistry'
import { IndicatorKind, type IndicatorMetadata } from '../../../indicators/indicatorMetadata'
import { loadBuiltinIndicators } from '../../../indicators/registerBuiltins'
import { createSubIndicatorRenderer } from '../index'

beforeAll(async () => {
  await loadBuiltinIndicators()
})

describe('createSubIndicatorRenderer', () => {
  it('通过定义工厂创建渲染器并透传 instanceId', () => {
    const rendererFactory = vi.fn(() => createTestRendererPlugin('custom_renderer'))
    const definition: IndicatorMetadata = createTestIndicatorMetadata(
      {
        name: 'customIndicator',
        displayName: 'CUSTOM',
        kind: IndicatorKind.Indicator,
        category: 'sub',
        indicatorType: 'other',
      },
      { defaultPaneId: 'sub_CUSTOM', rendererFactory },
    )

    const renderer = createSubIndicatorRenderer({
      indicatorId: 'CUSTOM',
      paneId: 'sub_CUSTOM',
      instanceId: 'instance-1',
      definition,
      params: { period: 12 },
    })

    expect(renderer.name).toBe('custom_renderer')
    expect(rendererFactory).toHaveBeenCalledWith({
      indicatorId: 'CUSTOM',
      paneId: 'sub_CUSTOM',
      instanceId: 'instance-1',
      params: { period: 12 },
    })
  })

  it('通过注册表解析内置定义并创建对应渲染器', () => {
    const definition = getRegisteredIndicatorDefinition('VOLUME_PROFILE')
    if (!definition) throw new Error('Missing builtin indicator definition: volumeProfile')

    const renderer = createSubIndicatorRenderer({
      indicatorId: definition.name,
      paneId: 'VOLUME_PROFILE_0',
      instanceId: 'instance-2',
      definition,
    })

    expect(definition.name).toBe('volumeProfile')
    expect(renderer.name).toBe('volumeProfile_VOLUME_PROFILE_0')
  })
})
