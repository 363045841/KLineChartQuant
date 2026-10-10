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
  loadIndicatorDefinitions,
  resolveIndicatorLayerId,
} from '@/engine/indicators/indicatorDefinitionRegistry'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata'
import { loadBuiltinIndicators } from '@/engine/indicators/registerBuiltins'
import { createChartController } from '../chart/index'
import { allIndicatorDefinitions } from '../indicatorDefinitionCatalog'
import type { ChartController, KLineData } from '../types'

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

/** 返回已加载实现的内部名称，按字母排序。 */
function loadedNames(): string[] {
  return getRegisteredIndicatorDefinitions()
    .map((definition) => definition.name)
    .sort()
}

/** 用户可添加的内置指标名称（不含系统定义）。 */
const userIndicatorNames = BUILTIN_INDICATOR_MANIFEST.filter(
  (entry) => entry.descriptor.kind === IndicatorKind.Indicator,
).map((entry) => entry.descriptor.name)

function createBars(length = 60): KLineData[] {
  return Array.from({ length }, (_, index) => ({
    timestamp: (index + 1) * 86_400_000,
    open: index + 10,
    high: index + 12,
    low: index + 8,
    close: index + 11,
    volume: 100,
  }))
}

/** 挂载一个按需加载模式的图表，容器尺寸固定。 */
async function mountController(): Promise<{ controller: ChartController; container: HTMLElement }> {
  const container = document.createElement('div')
  Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true })
  Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true })
  document.body.appendChild(container)
  const controller = await createChartController({ container, data: createBars() })
  return { controller, container }
}

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
    expect(catalog.find((item) => item.id === 'RSI')?.params?.map((param) => param.key)).toEqual(
      expect.arrayContaining(['period1', 'period2', 'period3']),
    )
    expect(loads.size).toBe(0)
    expect(getRegisteredIndicatorDefinitions()).toEqual([])
  })

  it('loads exactly the requested module, once, when an indicator is added', async () => {
    await Promise.all([loadIndicatorDefinitions(['RSI']), loadIndicatorDefinitions(['rsi'])])
    expect([...loads]).toEqual([['rsi', 1]])
    expect(loadedNames()).toEqual(['rsi'])
    await loadIndicatorDefinitions(['RSI', 'unknown-indicator'])
    expect([...loads]).toEqual([['rsi', 1]])
  })
})

describe('chart controller on-demand loading', () => {
  it('creates a chart with only system definitions and adds one indicator on demand', async () => {
    const { controller, container } = await mountController()
    try {
      const systemNames = BUILTIN_INDICATOR_MANIFEST.filter(
        (entry) => entry.descriptor.kind === IndicatorKind.System,
      ).map((entry) => entry.descriptor.name)
      expect(loadedNames()).toEqual([...systemNames].sort())
      expect(controller.catalog).toHaveLength(userIndicatorNames.length)

      // 未加载时同步方法拒绝写入，并提示宿主先加载。
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(controller.addIndicator('MACD', 'sub')).toBeNull()
      expect(warn).toHaveBeenCalledOnce()

      loads.clear()
      await controller.loadIndicators(['MACD'])
      expect([...loads]).toEqual([['macd', 1]])
      const instanceId = controller.addIndicator('MACD', 'sub')
      expect(instanceId).not.toBeNull()
      const pane = controller.subPanes.peek().find((item) => item.indicatorId === 'MACD')
      expect(pane).toBeDefined()
      expect(controller.getRenderer(resolveIndicatorLayerId('MACD', pane!.paneId))).toBeDefined()
    } finally {
      await controller.dispose()
      container.remove()
    }
  })

  it('restores a saved layout only after loading the indicators it references', async () => {
    const first = await mountController()
    await first.controller.loadIndicators(['RSI', 'BOLL'])
    expect(first.controller.addIndicator('RSI', 'sub')).not.toBeNull()
    expect(first.controller.addIndicator('BOLL', 'main')).not.toBeNull()
    await first.controller.saveLayout({ name: 'restored' })
    await first.controller.dispose()
    first.container.remove()

    // 新会话：实现目录清空，只有布局归档保留。
    clearRegisteredIndicatorDefinitionsForTest()
    loads.clear()
    const second = await mountController()
    try {
      expect(loads.get('rsi')).toBe(1)
      expect(loads.get('boll')).toBe(1)
      expect([...loads.keys()].filter((name) => userIndicatorNames.includes(name)).sort()).toEqual([
        'boll',
        'rsi',
      ])
      const catalogIds = new Set(second.controller.catalog.map((item) => item.id))
      const restored = second.controller.indicators
        .peek()
        .filter((instance) => catalogIds.has(instance.definitionId))
      expect(restored.map((instance) => instance.definitionId).sort()).toEqual(['BOLL', 'RSI'])
      const rsiPane = second.controller.subPanes.peek().find((item) => item.indicatorId === 'RSI')
      expect(rsiPane).toBeDefined()
      // 副图首帧即可使用该指标的 renderer 与坐标轴，不存在先空后补的帧。
      expect(
        second.controller.getRenderer(resolveIndicatorLayerId('RSI', rsiPane!.paneId)),
      ).toBeDefined()
      expect(
        second.controller.getRenderer(resolveIndicatorLayerId('RSI', rsiPane!.paneId, 'scale')),
      ).toBeDefined()
    } finally {
      await second.controller.dispose()
      second.container.remove()
    }
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
            indicatorType: definition.indicatorType,
            indicatorTypeLabel: definition.indicatorTypeLabel,
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
