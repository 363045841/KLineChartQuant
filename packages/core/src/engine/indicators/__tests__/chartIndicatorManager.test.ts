import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

import { createPluginHost } from '../../../foundation/plugin/PluginHost'
import { createSignal } from '../../../foundation/reactivity/signal'
import { createIndicatorState } from '../../state/indicatorState'
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
  const indicatorState = createIndicatorState()

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
    updateRendererConfig: vi.fn(),
    setRendererEnabled: vi.fn(),
    hasPane: vi.fn(() => false),
    upsertPane: vi.fn(),
    removePaneDefinition: vi.fn(),
    getPaneSpecs: vi.fn(() => []),
    getPaneRatiosSignal: () => paneRatiosSignal,
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
  })
})
