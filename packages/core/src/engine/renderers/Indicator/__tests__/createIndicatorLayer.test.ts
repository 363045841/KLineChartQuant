/**
 * createIndicatorLayer 测试：按指标定义装配 Layer，并支持显式 role 覆盖。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestIndicatorMetadata } from '@/engine/indicators/__tests__/helpers/metadataTestKit'
import { getRegisteredIndicatorDefinition } from '@/engine/indicators/indicatorDefinitionRegistry'
import { IndicatorKind, type IndicatorMetadata } from '@/engine/indicators/indicatorMetadata'
import { loadBuiltinIndicators } from '@/engine/indicators/registerBuiltins'
import type { Layer } from '@/rendering/scene/types'
import { createIndicatorLayer } from '../factory'

beforeAll(async () => {
  await loadBuiltinIndicators()
})

/** 构造满足 Layer 契约的最小替身，避免测试用强转。 */
function createTestLayer(id: string, role: Layer['role'] = 'indicator'): Layer<never> {
  return {
    id,
    role,
    pane: 'sub_test',
    z: 0,
    visible: true,
    paint: () => {},
    dispose: () => {},
  }
}

describe('createIndicatorLayer', () => {
  it('通过定义工厂创建 Layer 并透传 instanceId/params', () => {
    const rendererFactory = vi.fn(() => createTestLayer('plugin:custom_renderer'))
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

    const layer = createIndicatorLayer({
      indicatorId: 'CUSTOM',
      paneId: 'sub_CUSTOM',
      instanceId: 'instance-1',
      definition,
      params: { period: 12 },
    })

    expect(layer.id).toBe('plugin:custom_renderer')
    expect(rendererFactory).toHaveBeenCalledWith({
      indicatorId: 'CUSTOM',
      paneId: 'sub_CUSTOM',
      instanceId: 'instance-1',
      params: { period: 12 },
    })
  })

  it('显式 role 覆盖渲染器推导的 role', () => {
    const definition: IndicatorMetadata = createTestIndicatorMetadata(
      {
        name: 'customIndicator',
        displayName: 'CUSTOM',
        kind: IndicatorKind.Indicator,
        category: 'main',
        indicatorType: 'other',
      },
      { defaultPaneId: 'main', rendererFactory: () => createTestLayer('plugin:x', 'indicator') },
    )

    const layer = createIndicatorLayer({
      indicatorId: 'CUSTOM',
      paneId: 'main',
      instanceId: 'instance-1',
      definition,
      role: 'primary',
    })

    expect(layer.role).toBe('primary')
  })

  it('通过注册表解析内置定义并创建对应 Layer', () => {
    const definition = getRegisteredIndicatorDefinition('VOLUME_PROFILE')
    if (!definition) throw new Error('Missing builtin indicator definition: volumeProfile')

    const layer = createIndicatorLayer({
      indicatorId: definition.name,
      paneId: 'VOLUME_PROFILE_0',
      instanceId: 'instance-2',
      definition,
    })

    expect(definition.name).toBe('volumeProfile')
    expect(layer.id).toBe('plugin:volumeProfile_VOLUME_PROFILE_0')
  })
})
