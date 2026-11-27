/**
 * 指标 metadata 测试共享夹具：合法渲染器 Layer 与最小 IndicatorMetadata。
 * 仅供 __tests__ 消费；vitest 只收集 *.test.ts，本文件不会被当作测试。
 */

import { makePluginLayerId } from '@/foundation/plugin/impl/rendererLayerId'
import type { Layer } from '@/rendering/scene/types'

import type { IndicatorCategory } from '../../indicatorMetadata'
import type { RenderableIndicator } from '../../../renderers/Indicator/types.js'

/** 构造满足 Layer 契约的最小渲染器，避免测试用强转。 */
export function createTestRendererLayer(name: string): Layer<never> {
  return {
    id: makePluginLayerId(name),
    role: 'content',
    pane: 'test',
    z: 0,
    visible: true,
    paint: () => {},
    dispose: () => {},
  }
}

/** 构造最小 IndicatorMetadata 的必填字段。 */
export interface TestIndicatorMetadataInput {
  name: string
  displayName: string
  category: IndicatorCategory
}

/** 构造最小 IndicatorMetadata，只由用例声明自己关心的差异项。 */
export function createTestIndicatorMetadata(
  input: TestIndicatorMetadataInput,
  overrides: Partial<Extract<RenderableIndicator, { kind: 'indicator' }>> = {},
): RenderableIndicator {
  return {
    kind: 'indicator',
    name: input.name,
    displayName: input.displayName,
    category: input.category,
    defaultPaneId: 'sub_test',
    rendererFactory: () => createTestRendererLayer(`${input.name}_renderer`),
    getRendererName: ({ paneId }) => `${input.name}_${paneId}`,
    ...overrides,
  }
}
