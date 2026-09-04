import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

import { createPluginHost } from '../../../foundation/plugin/PluginHost'
import { createSignal } from '../../../foundation/reactivity/signal'
import { createIndicatorState } from '../../state/indicatorState'
import { createIndicatorResultState } from '../../state/indicatorResultState'
import type { VisibleRange } from '../../layout/pane'
import { UpdateLevel } from '../../layout/pane'
import { ChartIndicatorManager, type IndicatorDependencies } from '../chartIndicatorManager'
import { loadBuiltinIndicators } from '../registerBuiltins'

beforeAll(async () => {
  await loadBuiltinIndicators()
})

function createMockDeps() {
  const rendererMap = new Map<string, any>()
  const useRenderer = vi.fn((plugin: any, _config?: any) => {
    if (plugin?.name) rendererMap.set(plugin.name, plugin)
  })
  const paneRatiosSignal = createSignal<Readonly<Record<string, number>>>({})
  const paneSpecsSignal = createSignal<ReadonlyArray<any>>([])
  const indicatorState = createIndicatorState()
  const indicatorResultState = createIndicatorResultState()
  const createSubPane = vi.fn((entry) => indicatorState.actions.upsertSub(entry))

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
    useRenderer,
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
    paneRatios$: paneRatiosSignal,
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
    indicator: indicatorState,
    indicatorResult: indicatorResultState,
    subPaneOps: {
      create: createSubPane,
      remove: vi.fn((paneId) => indicatorState.actions.removeSub(paneId)),
      replace: vi.fn((paneId, indicatorId, params) =>
        indicatorState.actions.replaceSub({ paneId, indicatorId, params }),
      ),
      setParams: vi.fn((paneId, params) => indicatorState.actions.setSubParams(paneId, params)),
      clear: vi.fn(() => indicatorState.actions.clearSub()),
    },
    projectPaneLayout: vi.fn(),
    runRendererTransaction: (run) => run(),
    getIndicatorScheduler: vi.fn(),
  } as IndicatorDependencies & {
    rendererMap: Map<string, any>
    useRenderer: typeof useRenderer
    subPaneOps: IndicatorDependencies['subPaneOps'] & { create: typeof createSubPane }
  }
}

describe('ChartIndicatorManager', () => {
  let manager: ChartIndicatorManager
  let deps: ReturnType<typeof createMockDeps>

  beforeEach(() => {
    deps = createMockDeps()
    manager = new ChartIndicatorManager(deps)
    manager.start()
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
    it('starts runtime projection only once', () => {
      manager.start()
      manager.enableMainIndicator('MA')

      expect(deps.useRenderer).toHaveBeenCalledTimes(2)
    })

    it('separates sub-indicator instance identity from pane identity and capability', () => {
      const instanceId = manager.addIndicator('VOL', 'sub')
      expect(instanceId).not.toBeNull()

      const entry = manager.getSubPaneEntries()[0]!
      expect(entry.instanceId).toBe(instanceId)
      expect(entry.instanceId).not.toBe(entry.paneId)
      expect(entry.indicatorId).toBe('volume')
      expect(entry.ordinal).toBe(0)

      expect(manager.updateIndicatorParams(instanceId!, { opacity: 0.5 })).toBe(true)
      expect(manager.removeIndicator(instanceId!)).toBe(true)
      expect(manager.getSubPaneEntries()).toEqual([])
    })

    it('registers main indicator resources once across duplicate enable calls', () => {
      expect(manager.enableMainIndicator('MA')).toBe(true)
      expect(manager.enableMainIndicator('MA')).toBe(true)

      expect(deps.useRenderer).toHaveBeenCalledTimes(2)
      expect(manager.isMainIndicatorActive('MA')).toBe(true)
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

      deps.indicator.actions.upsertMain('MA', { ma5: true })

      expect(deps.useRenderer).not.toHaveBeenCalled()
      expect(deps.scheduleDraw).not.toHaveBeenCalled()
    })
  })
})
