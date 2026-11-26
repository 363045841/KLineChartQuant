/** 验证指标 Layer 工厂透传实例配置，并应用调用方指定的绘制角色。 */
import { expect, it, vi } from 'vitest'
import {
  createTestIndicatorMetadata,
  createTestRendererLayer,
} from '@/engine/indicators/__tests__/helpers/metadataTestKit'
import { createIndicatorLayer } from '../factory'

it('透传实例身份和参数，并应用显式 role', () => {
  const rendererFactory = vi.fn(() => createTestRendererLayer('custom_renderer'))
  const definition = createTestIndicatorMetadata(
    {
      name: 'customIndicator',
      displayName: 'CUSTOM',
      category: 'main',
    },
    { rendererFactory },
  )
  const input = {
    indicatorId: definition.name,
    paneId: 'main',
    instanceId: 'instance-1',
    axisId: 'main',
    params: { period: 12 },
  }

  const layer = createIndicatorLayer({ ...input, definition, role: 'content' })

  expect(rendererFactory).toHaveBeenCalledWith(expect.objectContaining(input))
  expect(layer.role).toBe('content')
  expect(layer.id).toContain('instance-1')
})
