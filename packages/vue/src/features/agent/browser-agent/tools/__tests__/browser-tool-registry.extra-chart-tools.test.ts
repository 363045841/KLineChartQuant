/** 外部图表工具注入：构造期来源与挂载后补注册都进入 Agent 工具目录。 */
import { getRegisteredChartTools } from '@363045841yyt/klinechart-core/controllers'
import { describe, expect, it } from 'vitest'
import { BrowserToolRegistry } from '../impl/browser-tool-registry.js'
import type { BrowserToolRegistryDependencies } from '../types.js'

/** 构造最小依赖；提问与网络搜索在本用例里不会触发。 */
function createDependencies(
  extraChartTools?: BrowserToolRegistryDependencies['extraChartTools'],
): BrowserToolRegistryDependencies {
  return {
    fetch: globalThis.fetch,
    getWebSearchApiKey: () => undefined,
    requestQuestion: async () => {
      throw new Error('ask_user 不在本用例范围内')
    },
    extraChartTools,
  }
}

/** 取一个真实的内置图表工具作为注入样本，避免手写替身漂移。 */
function sampleTool() {
  const [tool] = getRegisteredChartTools()
  if (tool === undefined) throw new Error('内置图表工具目录为空')
  return tool
}

describe('BrowserToolRegistry extraChartTools', () => {
  it('registers tools supplied by the host factory', () => {
    const tool = sampleTool()
    const registry = new BrowserToolRegistry(createDependencies(() => [tool]))
    expect(registry.catalog.check(tool.config.name, { agent: null, readOnly: false })).toBeDefined()
  })

  it('accepts tools registered after construction', () => {
    const sample = sampleTool()
    const external = { ...sample, config: { ...sample.config, name: 'external_sample_tool' } }
    const registry = new BrowserToolRegistry(createDependencies())
    expect(
      registry.catalog.check(external.config.name, { agent: null, readOnly: false }),
    ).toBeUndefined()
    registry.registerChartTools([external])
    expect(
      registry.catalog.check(external.config.name, { agent: null, readOnly: false }),
    ).toBeDefined()
  })
})
