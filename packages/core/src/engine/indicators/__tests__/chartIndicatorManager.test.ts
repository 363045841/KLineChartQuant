import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

import { createPluginHost } from '../../../foundation/plugin/PluginHost'
import { createSignal } from '../../../foundation/reactivity/signal'
import { createIndicatorState } from '../../state/indicatorState'
import { createSubPaneState } from '../../state/subPaneState'
import type { VisibleRange } from '../../layout/pane'
import { UpdateLevel } from '../../layout/pane'
import { ChartIndicatorManager, type IndicatorDependencies } from '../chartIndicatorManager'
import { loadBuiltinIndicators } from '../registerBuiltins'

beforeAll(async () => {
  await loadBuiltinIndicators()
})

function createMockDeps() {
  const rendererMap = new Map<string, any>()
  const paneRatiosSignal = createSignal<Readonly<Record<string, number>>>({})
  const paneSpecsSignal = createSignal<ReadonlyArray<any>>([])
  const indicatorState = createIndicatorState()
  const subPaneState = createSubPaneState()

  return {
    rendererMap,
    getOption: () => ({
      rightAxisWidth: 60,
      leftAxisWidth: 60,
      priceLabelWidth: 60,
      yPaddingPx: 4,
      paneGap: 1,
      defaultPaneMinHeightPx: 40,
      panes: [],
      bottomAxisHeight: 20,
      kWidth: 8,
      kGap: 2,
      minKWidth: 4,
      maxKWidth: 16,
    }),
    getPluginHost: () => createPluginHost(),
    getRenderer: vi.fn((name: string) => rendererMap.get(name)),
    useRenderer: vi.fn((plugin: any, _config?: any) => {
      if (plugin?.name) rendererMap.set(plugin.name, plugin)
    }),
    removeRenderer: vi.fn((name: string) => {
      rendererMap.delete(name)
    }),
    updateRendererConfig: vi.fn((name: string, config: Record<string, unknown>) => {
      rendererMap.get(name)?.setConfig?.(config)
    }),
    setRendererEnabled: vi.fn(),
    hasPane: vi.fn(() => false),
    upsertPane: vi.fn(),
    removePaneDefinition: vi.fn(),
    getPaneSpecs: vi.fn(() => []),
    getPaneRatiosSignal: () => paneRatiosSignal,
    paneSpecs$: paneSpecsSignal,
    getInternalPaneRatios: vi.fn(() => new Map()),
    setInternalPaneRatio: vi.fn(),
    deleteInternalPaneRatio: vi.fn(),
    applyPaneLayoutSpecs: vi.fn(),
    getLastVisibleRange: vi.fn(() => ({ start: 0, end: 0 }) as VisibleRange),
    getCrosshairPos: vi.fn(() => null),
    getCrosshairPrice: vi.fn(() => null),
    getActivePaneId: vi.fn(() => null),
    scheduleDraw: vi.fn(),
    getRenderContext: vi.fn(() => null),
    addLayer: vi.fn(),
    removeLayer: vi.fn(() => false),
    getLayer: vi.fn(() => null),
    setLayerVisibility: vi.fn(),
    mainIndicators$: indicatorState.readonly.mainIndicators,
    upsertMainIndicator: (id, p) => indicatorState.actions.upsert(id, p),
    removeMainIndicator: (id) => indicatorState.actions.remove(id),
    setMainIndicatorParams: (id, p) => indicatorState.actions.setParams(id, p),
    replaceMainIndicators: (entries) => indicatorState.actions.replaceAll(entries),
    clearMainIndicators: () => indicatorState.actions.clear(),
    subPanes$: subPaneState.readonly.entries,
    createSubPaneState: vi.fn((paneId, indicatorId, params) =>
      subPaneState.actions.upsert({ paneId, indicatorId, params }),
    ),
    removeSubPaneState: vi.fn((paneId) => subPaneState.actions.remove(paneId)),
    replaceSubPaneState: vi.fn((paneId, indicatorId, params) =>
      subPaneState.actions.replace({ paneId, indicatorId, params }),
    ),
    updateSubPaneStateParams: vi.fn((paneId, params) =>
      subPaneState.actions.setParams(paneId, params),
    ),
    clearSubPaneState: vi.fn(() => subPaneState.actions.clear()),
    projectPaneLayout: vi.fn(),
    runRendererTransaction: (run) => run(),
    getIndicatorScheduler: vi.fn(),
    getRightAxisWidth: () => 60,
    getPriceLabelWidth: () => 60,
    getYPaddingPx: () => 4,
  } as IndicatorDependencies & { rendererMap: Map<string, any> }
}

describe('ChartIndicatorManager', () => {
  let manager: ChartIndicatorManager
  let deps: ReturnType<typeof createMockDeps>

  beforeEach(() => {
    deps = createMockDeps()
    manager = new ChartIndicatorManager(deps)
    vi.clearAllMocks()
  })

  describe('updateMainIndicatorParams', () => {
    it('should call renderer setConfig with merged params', () => {
      manager.enableMainIndicator('MA')

      const maRenderer = deps.rendererMap.get('ma')
      const setConfigSpy = vi.spyOn(maRenderer, 'setConfig')

      manager.updateMainIndicatorParams('MA', { ma5: false })

      expect(setConfigSpy).toHaveBeenCalledTimes(1)
      expect(setConfigSpy).toHaveBeenCalledWith({
        ma5: false,
        ma10: true,
        ma20: true,
        ma30: true,
        ma60: true,
      })
    })

    it('should merge params instead of replacing', () => {
      manager.enableMainIndicator('MA')

      manager.updateMainIndicatorParams('MA', { ma5: false })

      const params = manager.getMainIndicatorParams('MA')
      expect(params).toEqual({ ma5: false, ma10: true, ma20: true, ma30: true, ma60: true })
    })

    it('should schedule a redraw after params update', () => {
      manager.enableMainIndicator('MA')
      vi.clearAllMocks()

      manager.updateMainIndicatorParams('MA', { ma5: false })

      expect(deps.scheduleDraw).toHaveBeenCalledTimes(1)
    })

    it('should be no-op when indicator is not active', () => {
      manager.updateMainIndicatorParams('MA', { ma5: false })

      expect(deps.scheduleDraw).not.toHaveBeenCalled()
      expect(manager.getMainIndicatorParams('MA')).toBeNull()
    })

    it('getMainIndicatorParams returns a copy', () => {
      manager.enableMainIndicator('MA')
      const params = manager.getMainIndicatorParams('MA')!
      params.ma5 = false
      expect(manager.getMainIndicatorParams('MA')?.ma5).toBe(true)
    })
  })

  describe('state-driven projection', () => {
    it('registers main indicator resources once across duplicate enable calls', () => {
      expect(manager.enableMainIndicator('MA')).toBe(true)
      expect(manager.enableMainIndicator('MA')).toBe(true)

      expect(deps.useRenderer).toHaveBeenCalledTimes(2)
      expect(manager.isMainIndicatorActive('MA')).toBe(true)
    })

    it('creates sub-pane business state before projecting runtime resources', () => {
      expect(manager.createSubPane('RSI_0', 'RSI', { period1: 6 })).toBe(true)

      expect(deps.createSubPaneState).toHaveBeenCalledTimes(1)
      expect(deps.useRenderer).toHaveBeenCalled()
      expect(deps.createSubPaneState.mock.invocationCallOrder[0]).toBeLessThan(
        deps.useRenderer.mock.invocationCallOrder[0]!,
      )
      expect(manager.getSubPaneEntry('RSI_0')?.params).toEqual({ period1: 6 })
    })

    it('treats a duplicate pane id as a no-op even when the indicator differs', () => {
      manager.createSubPane('RSI_0', 'RSI', { period1: 6 })
      vi.clearAllMocks()

      expect(manager.createSubPane('RSI_0', 'MACD', { fast: 5 })).toBe(true)

      expect(deps.replaceSubPaneState).not.toHaveBeenCalled()
      expect(manager.getSubPaneEntry('RSI_0')?.indicatorId).toBe('RSI')
      expect(manager.getSubPaneEntry('RSI_0')?.params).toEqual({ period1: 6 })
    })

    it('reasserts identical desired state when the initial runtime mount failed', () => {
      deps.useRenderer.mockImplementationOnce(() => {
        throw new Error('mount failed')
      })
      manager.createSubPane('RSI_0', 'RSI', { period1: 6 })
      expect(manager.subPaneManagerAccessor.getMountedResources('RSI_0')).toBeUndefined()

      manager.createSubPane('RSI_0', 'RSI', { period1: 6 })

      expect(manager.subPaneManagerAccessor.getMountedResources('RSI_0')).toBeDefined()
    })

    it('projects distinct non-finite main-indicator parameter values', () => {
      manager.enableMainIndicator('MA', { threshold: Number.NaN })
      vi.clearAllMocks()

      manager.updateMainIndicatorParams('MA', { threshold: Number.POSITIVE_INFINITY })

      expect(deps.updateRendererConfig).toHaveBeenCalled()
    })

    it('stops projection before runtime resources are destroyed', () => {
      manager.destroy()
      vi.clearAllMocks()

      deps.upsertMainIndicator('MA', { ma5: true })

      expect(deps.useRenderer).not.toHaveBeenCalled()
      expect(deps.scheduleDraw).not.toHaveBeenCalled()
    })
  })
})
