/**
 * 指标 metadata 测试共享夹具：合法 renderer plugin 与最小 IndicatorMetadata。
 * 仅供 __tests__ 消费；vitest 只收集 *.test.ts，本文件不会被当作测试。
 */
import type { RendererPluginWithHost } from '@/plugin'

import type { IndicatorCategory, IndicatorMetadata, IndicatorType } from '../../indicatorMetadata'

/** 构造满足 RendererPluginWithHost 的最小渲染器，避免测试用强转。 */
export function createTestRendererPlugin(name: string): RendererPluginWithHost {
  return {
    name,
    version: '1.0.0',
    description: 'test renderer',
    paneId: 'test',
    priority: 0,
    draw: () => {},
  }
}

/** 构造最小 IndicatorMetadata 的必填字段。 */
export interface TestIndicatorMetadataInput {
  name: string
  displayName: string
  category: IndicatorCategory
  indicatorType: IndicatorType
}

/** 构造最小 IndicatorMetadata，只由用例声明自己关心的差异项。 */
export function createTestIndicatorMetadata(
  input: TestIndicatorMetadataInput,
  overrides: Partial<IndicatorMetadata> = {},
): IndicatorMetadata {
  return {
    name: input.name,
    displayName: input.displayName,
    category: input.category,
    indicatorType: input.indicatorType,
    defaultPaneId: 'sub_test',
    rendererFactory: () => createTestRendererPlugin(`${input.name}_renderer`),
    getRendererName: ({ paneId }) => `${input.name}_${paneId}`,
    getScaleRendererName: () => null,
    getPaneTitleRendererName: () => null,
    ...overrides,
  }
}
