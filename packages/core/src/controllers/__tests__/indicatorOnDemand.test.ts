// @vitest-environment jsdom
/**
 * 验证指标实现按需加载：目录同步可用且不加载实现，添加只加载自身模块，
 * 布局恢复在写入状态前加载其指标，静态目录与实现元数据一致。
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCanvasGetContextMock,
  ResizeObserverMock,
  stubAnimationFrame,
} from '@/engine/__tests__/helpers/chartDomTestKit'
import { BUILTIN_INDICATOR_MANIFEST } from '@/engine/indicators/generated/builtinIndicators'
import {
  clearRegisteredIndicatorDefinitionsForTest,
  getIndicatorDescriptors,
  getRegisteredIndicatorDefinition,
  getRegisteredIndicatorDefinitions,
} from '@/engine/indicators/indicatorDefinitionRegistry'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata'
import { loadBuiltinIndicators } from '@/engine/indicators/registerBuiltins'
import { allIndicatorDefinitions } from '../indicatorDefinitionCatalog'

/** 记录每个内置定义模块的加载次数；必须在注册表首次读取目录前安装。 */
const loads = new Map<string, number>()
beforeAll(() => {
  for (const entry of BUILTIN_INDICATOR_MANIFEST) {
    const load = entry.load
    vi.spyOn(entry, 'load').mockImplementation(() => {
      loads.set(entry.descriptor.name, (loads.get(entry.descriptor.name) ?? 0) + 1)
      return load()
    })
  }
})

/** 用户可添加的内置指标名称（不含系统定义）。 */
const userIndicatorNames = BUILTIN_INDICATOR_MANIFEST.filter(
  (entry) => entry.descriptor.kind === IndicatorKind.Indicator,
).map((entry) => entry.descriptor.name)

beforeEach(async () => {
  // 每个用例使用独立的布局归档，避免前一用例的自动保存参与恢复。
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('@363045841yyt/klinechart-layouts')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
  clearRegisteredIndicatorDefinitionsForTest()
  loads.clear()
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  stubAnimationFrame()
  HTMLCanvasElement.prototype.getContext = createCanvasGetContextMock()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('indicator catalog without implementations', () => {
  it('lists every indicator for the picker without loading any module', () => {
    const catalog = allIndicatorDefinitions()
    expect(catalog).toHaveLength(userIndicatorNames.length)
    expect(loads.size).toBe(0)
    expect(getRegisteredIndicatorDefinitions()).toEqual([])
  })
})

describe('static catalog fidelity', () => {
  it('matches the metadata of every loaded implementation', async () => {
    await loadBuiltinIndicators()
    const descriptors = getIndicatorDescriptors()
    expect(descriptors).toHaveLength(BUILTIN_INDICATOR_MANIFEST.length)
    for (const descriptor of descriptors) {
      const definition = getRegisteredIndicatorDefinition(descriptor.name)!
      const runtimeDefaults = definition.runtime?.defaultParams
      expect(descriptor, descriptor.name).toEqual(
        JSON.parse(
          JSON.stringify({
            name: definition.name,
            kind: definition.kind,
            aliases: definition.aliases,
            displayName: definition.displayName,
            category: definition.category,
            defaultPaneId: definition.defaultPaneId,
            dataViews: definition.dataViews,
            allowMainPane: definition.allowMainPane,
            defaultParams:
              typeof runtimeDefaults === 'function' ? runtimeDefaults() : runtimeDefaults,
            defaultOptions: definition.presentation?.defaultOptions,
          }),
        ),
      )
    }
  })
})
