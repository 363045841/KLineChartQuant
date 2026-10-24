// @vitest-environment jsdom
/**
 * 验证指标目录与实现的分离：宿主注册的定义直接进入目录，内置实现按需加载，
 * 布局恢复在写入状态前加载其指标，静态目录与实现元数据一致。
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCanvasGetContextMock,
  ResizeObserverMock,
  stubAnimationFrame,
} from '@/engine/__tests__/helpers/chartDomTestKit'
import { registerPlotIndicatorFixture } from '@/engine/indicators/__tests__/helpers/plotIndicatorTestKit'
import { BUILTIN_INDICATOR_MANIFEST } from '@/engine/indicators/generated/builtinIndicators'
import {
  clearRegisteredIndicatorDefinitionsForTest,
  getIndicatorDescriptors,
  getRegisteredIndicatorDefinition,
  getRegisteredIndicatorDefinitions,
} from '@/engine/indicators/indicatorDefinitionRegistry'
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
  it('lists host-registered indicators without loading builtin implementations', () => {
    registerPlotIndicatorFixture({
      name: 'LateRegisteredFixture',
      category: 'sub',
      compute: () => ({ plots: [], fills: [] }),
    })
    expect(allIndicatorDefinitions().map((definition) => definition.id)).toEqual([
      'LateRegisteredFixture',
    ])
    expect(loads.size).toBe(0)
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
