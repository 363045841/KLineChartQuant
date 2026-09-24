/**
 * ChartIndicatorManager 测试：实例 CRUD、主图增删改、副图 pane 联动、读者寻址与主图价格范围。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RendererPlugin, RendererPluginWithHost } from '@/foundation/plugin'
import { createPluginHost } from '@/foundation/plugin'
import { createSignal } from '@/foundation/reactivity/signal'
import type { PaneSpec } from '../../chartTypes'
import { createIndicatorState } from '../../state/indicatorState'
import { ChartIndicatorManager, type IndicatorDependencies } from '../chartIndicatorManager'
import { loadBuiltinIndicators } from '../registerBuiltins'
import { createTestData } from './helpers/instanceTestKit'

beforeAll(async () => {
  await loadBuiltinIndicators()
})

/** 构造满足 IndicatorDependencies 的最小依赖，并暴露可断言的 renderer 记录。 */
function createMockDeps() {
  const renderers = new Map<string, RendererPluginWithHost>()
  const paneRatios$ = createSignal<Readonly<Record<string, number>>>({})
  const paneSpecs$ = createSignal<ReadonlyArray<PaneSpec>>([])
  const indicator = createIndicatorState()
  const useRenderer = vi.fn((plugin: RendererPlugin | RendererPluginWithHost) => {
    renderers.set(plugin.name, plugin)
  })
  const subPaneOps: IndicatorDependencies['subPaneOps'] = {
    create: (entry) => indicator.actions.upsertSub(entry),
    remove: (paneId) => indicator.actions.removeSub(paneId),
    replace: (paneId, indicatorId, params) =>
      indicator.actions.replaceSub({ paneId, indicatorId, params }),
    setParams: (paneId, params) => indicator.actions.setSubParams(paneId, params),
    clear: () => indicator.actions.clearSub(),
  }

  const deps = {
    getOption: () => ({
      yPaddingPx: 4,
      rightAxisWidth: 60,
      leftAxisWidth: 60,
      bottomAxisHeight: 20,
      minKWidth: 4,
      maxKWidth: 16,
      panes: [] as PaneSpec[],
      kWidth: 8,
      kGap: 2,
    }),
    getPluginHost: () => createPluginHost(),
    getRenderer: () => undefined,
    useRenderer,
    removeRenderer: (name: string) => {
      renderers.delete(name)
    },
    updateRendererConfig: vi.fn((_name: string, _config: Record<string, unknown>) => {}),
    paneRatios$,
    paneSpecs$,
    projectPaneLayout: vi.fn(),
    getLastVisibleRange: () => ({ start: 0, end: 0 }),
    getCrosshairPos: () => null,
    getCrosshairPrice: () => null,
    getActivePaneId: () => null,
    scheduleDraw: vi.fn(),
    getRenderContext: () => null,
    getLayer: () => null,
    indicator,
    subPaneOps,
    runRendererTransaction: (run: () => void) => run(),
  } satisfies IndicatorDependencies

  return { deps, renderers, useRenderer, indicator }
}

describe('ChartIndicatorManager', () => {
  let manager: ChartIndicatorManager
  let harness: ReturnType<typeof createMockDeps>
  let deps: IndicatorDependencies

  beforeEach(() => {
    harness = createMockDeps()
    deps = harness.deps
    manager = new ChartIndicatorManager(deps)
    manager.start()
    vi.clearAllMocks()
  })

  afterEach(() => {
    manager.destroy()
  })

  describe('main indicator params', () => {
    it('更新主图参数时以合并后的完整参数配置渲染器', () => {
      manager.enableMainIndicator('MA')

      manager.updateMainIndicatorParams('MA', { ma5: false })

      expect(deps.updateRendererConfig).toHaveBeenCalledWith('ma', {
        ma5: false,
        ma10: true,
        ma20: true,
        ma30: true,
        ma60: true,
      })
    })

    it('参数按合并而非替换写回，并且读取返回副本', () => {
      manager.enableMainIndicator('MA')

      manager.updateMainIndicatorParams('MA', { ma5: false })

      expect(manager.getMainIndicatorParams('MA')).toEqual({
        ma5: false,
        ma10: true,
        ma20: true,
        ma30: true,
        ma60: true,
      })
      const params = manager.getMainIndicatorParams('MA')!
      params.ma5 = true
      expect(manager.getMainIndicatorParams('MA')?.ma5).toBe(false)
    })

    it('参数更新触发一次重绘', () => {
      manager.enableMainIndicator('MA')
      vi.clearAllMocks()

      manager.updateMainIndicatorParams('MA', { ma5: false })

      expect(deps.scheduleDraw).toHaveBeenCalledTimes(1)
    })

    it('未启用时参数更新为空操作', () => {
      manager.updateMainIndicatorParams('MA', { ma5: false })

      expect(deps.scheduleDraw).not.toHaveBeenCalled()
      expect(manager.getMainIndicatorParams('MA')).toBeNull()
    })
  })

  describe('主图实例增删', () => {
    it('重复启用只注册一次 renderer 资源', () => {
      expect(manager.enableMainIndicator('MA')).toBe(true)
      expect(manager.enableMainIndicator('MA')).toBe(true)

      expect(harness.useRenderer).toHaveBeenCalledTimes(2)
      expect(manager.isMainIndicatorActive('MA')).toBe(true)
      expect(manager.getActiveMainIndicators()).toEqual(['MA'])
    })

    it('禁用主图指标后不再处于启用状态', () => {
      manager.enableMainIndicator('MA')

      expect(manager.disableMainIndicator('MA')).toBe(true)
      expect(manager.isMainIndicatorActive('MA')).toBe(false)
      expect(manager.disableMainIndicator('MA')).toBe(false)
    })
  })

  describe('副图实例 CRUD', () => {
    it('为副图指标生成独立实例身份并支持增改删', () => {
      const instanceId = manager.addIndicator('VOL', 'sub')
      expect(instanceId).not.toBeNull()

      const entry = manager.getSubPaneEntries()[0]!
      expect(entry.instanceId).toBe(instanceId)
      expect(entry.instanceId).not.toBe(entry.paneId)
      expect(entry.indicatorId).toBe('VOL')
      expect(entry.ordinal).toBe(0)

      expect(manager.updateIndicatorParams(instanceId!, { opacity: 0.5 })).toBe(true)
      expect(manager.removeIndicator(instanceId!)).toBe(true)
      expect(manager.getSubPaneEntries()).toEqual([])
    })

    it('未知实例的改动操作返回 false', () => {
      expect(manager.updateIndicatorParams('missing', { opacity: 0.5 })).toBe(false)
      expect(manager.removeIndicator('missing')).toBe(false)
    })
  })

  describe('实例结果投影', () => {
    it('按 instanceId 提供计算结果并计算主图价格范围', async () => {
      manager.enableMainIndicator('MA')
      const data = createTestData(80)

      manager.updateIndicatorData(data, { start: 0, end: data.length })

      await vi.waitFor(() => {
        expect(manager.createRenderStateReader().get('main:MA')).toBeDefined()
      })
      const reader = manager.createRenderStateReader()
      const state = reader.get<{ visibleMin: number; visibleMax: number }>('main:MA')!
      expect(state.visibleMin).toBeLessThan(state.visibleMax)
      expect(reader.get('unknown-instance')).toBeUndefined()

      const range = manager.getMainIndicatorPriceRange()
      expect(range).not.toBeNull()
      expect(range!.min).toBeLessThan(range!.max)
    })

    it('可见区间变化只重建投影且不触发新帧', async () => {
      manager.enableMainIndicator('MA')
      const data = createTestData(80)
      manager.updateIndicatorData(data, { start: 0, end: data.length })
      await vi.waitFor(() => {
        expect(manager.createRenderStateReader().get('main:MA')).toBeDefined()
      })
      vi.clearAllMocks()

      expect(manager.updateVisibleRangeForFrame({ start: 10, end: 30 })).toBe(true)
      expect(deps.scheduleDraw).not.toHaveBeenCalled()
      expect(manager.updateVisibleRangeForFrame({ start: 10, end: 30 })).toBe(false)
    })

    it('把主图展示配置合入实例投影供 renderer 读取', async () => {
      manager.enableMainIndicator('BOLL')
      const data = createTestData(80)

      manager.updateIndicatorData(data, { start: 0, end: data.length })

      await vi.waitFor(() => {
        expect(manager.createRenderStateReader().get('main:BOLL')).toBeDefined()
      })
      const state = manager.createRenderStateReader().get<{
        params: Record<string, unknown>
        visibleMin: number
        visibleMax: number
      }>('main:BOLL')!

      expect(state.params.period).toBe(20)
      expect(state.params.multiplier).toBe(2)
      expect(state.params.showUpper).toBe(true)
      expect(state.params.showMiddle).toBe(true)
      expect(state.params.showLower).toBe(true)
      expect(state.visibleMin).toBeLessThan(state.visibleMax)
    })

    it('展示配置变化只重建投影', async () => {
      manager.enableMainIndicator('BOLL')
      const data = createTestData(80)
      manager.updateIndicatorData(data, { start: 0, end: data.length })
      await vi.waitFor(() => {
        expect(manager.createRenderStateReader().get('main:BOLL')).toBeDefined()
      })

      manager.updateMainIndicatorParams('BOLL', { showUpper: false })

      const state = manager.createRenderStateReader().get<{
        params: Record<string, unknown>
      }>('main:BOLL')!
      expect(state.params.showUpper).toBe(false)
      expect(state.params.showMiddle).toBe(true)
      expect(state.params.showLower).toBe(true)
    })
  })

  describe('生命周期', () => {
    it('销毁后停止状态投影', () => {
      manager.destroy()
      vi.clearAllMocks()

      harness.indicator.actions.upsertMain('MA', { ma5: true })

      expect(harness.useRenderer).not.toHaveBeenCalled()
      expect(deps.scheduleDraw).not.toHaveBeenCalled()
    })
  })
})
