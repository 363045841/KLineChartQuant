// @vitest-environment jsdom
/**
 * 验证指标目录与实现的分离：宿主注册的定义直接进入目录，内置实现按需加载，
 * 布局恢复在写入状态前加载其指标，静态目录与实现元数据一致。
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCanvasGetContextMock,
  ResizeObserverMock,
  stubAnimationFrame,
} from '@/engine/__tests__/helpers/chartDomTestKit'
import { registerPlotIndicatorFixture } from '@/engine/indicators/__tests__/helpers/plotIndicatorTestKit'
import {
  clearIndicatorStoreForTest,
  getRegisteredIndicatorDefinition,
  readIndicatorDescriptors,
} from '@/engine/indicators/pipeline/index'
import { loadBuiltinIndicators } from '@/engine/indicators/registerBuiltins'
import { indicatorCatalog } from '../indicatorCatalog/index'

beforeEach(async () => {
  // 每个用例使用独立的布局归档，避免前一用例的自动保存参与恢复。
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('@363045841yyt/klinechart-layouts')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
  clearIndicatorStoreForTest()
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
    // 目录里的内置项是静态占位（kind: indicator），不加载实现；宿主注册项同样直接可见。
    expect(indicatorCatalog().map((definition) => definition.id)).toContain('LateRegisteredFixture')
    expect(readIndicatorDescriptors().map((definition) => definition.name)).toEqual([
      'LateRegisteredFixture',
    ])
  })
})

describe('static catalog fidelity', () => {
  it('matches the metadata of every loaded implementation', async () => {
    registerPlotIndicatorFixture({
      name: 'CatalogFixture',
      category: 'sub',
      compute: () => ({ plots: [], fills: [] }),
    })
    await loadBuiltinIndicators()
    const descriptors = readIndicatorDescriptors()
    expect(descriptors).toHaveLength(1)
    for (const descriptor of descriptors) {
      const definition = getRegisteredIndicatorDefinition(descriptor.name)!
      const runtimeDefaults = definition.runtime?.defaultParams
      const runtimeInputDefs = definition.runtime?.inputDefs
      expect(JSON.parse(JSON.stringify(descriptor)), descriptor.name).toEqual(
        JSON.parse(
          JSON.stringify({
            name: definition.name,
            source: definition.source,
            aliases: definition.aliases,
            displayName: definition.displayName,
            category: definition.category,
            defaultPaneId: definition.defaultPaneId,
            dataViews: definition.dataViews,
            visiblePeriods: definition.visiblePeriods,
            defaultParams:
              typeof runtimeDefaults === 'function' ? runtimeDefaults() : runtimeDefaults,
            inputDefs: runtimeInputDefs,
            defaultOptions: definition.presentation?.defaultOptions,
          }),
        ),
      )
    }
  })
})
