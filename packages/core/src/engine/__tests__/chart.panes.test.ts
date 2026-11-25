// @vitest-environment jsdom
/** 窗格布局、比例、可见性、拖拽排序与窗格轴配置回归。 */
import { describe, expect, it, vi } from 'vitest'
import { PRICE_AXIS_RANGE_MODE } from '@/foundation/config/priceAxisRangeMode.js'
import { batch } from '@/foundation/reactivity/signal.js'
import { ScaleType } from '@/foundation/types/scaleType'
import {
  registerEmptyPlot,
  registerPlotDefinition,
} from '../indicators/__tests__/helpers/plotIndicatorTestKit'
import { resolveIndicatorLayerId } from '../indicators/indicatorLayerNaming'
import { LAYOUT_DOCUMENT_VERSION } from '../layout/types'
import { AXIS_GROUP_PRICE, axisGroupId } from '../pane/axisGroups.js'
import { INSTANCE_MOVE_KIND, MAIN_PANE_ID } from '../pane/types'
import { PRICE_SERIES_AXIS_ID } from '../renderers/rendererIds.js'
import { ResizeObserverMock } from './helpers/chartDomTestKit'
import {
  createTestChartRuntime,
  importPaneFixture,
  installChartTestHooks,
  mountChart,
} from './helpers/chartLifecycleTestKit'
import { createMockRenderContext } from './helpers/renderTestKit'

describe('Chart pane layout', () => {
  installChartTestHooks()

  it('fills every pane axis to the shared right width and publishes column changes immediately', async () => {
    const chart = mountChart()
    try {
      const id = 'shared-axis-width'
      registerEmptyPlot(id)
      const instanceId = chart.indicators.add(id)!
      const binding = chart.axes.bindingFor(instanceId)
      for (const requested of [80, 120]) {
        chart['commitAxisWidths']({
          left: 0,
          right: requested,
          rightByAxis: { [PRICE_SERIES_AXIS_ID]: requested, [binding.axisId]: 40 },
        })
        const geometry = chart.kernel.pane.readonly.paneGeometry.peek()
        for (const renderer of chart.getPaneRenderers()) {
          const pane = renderer.getPane()
          expect(pane.axisWidth).toBe(requested)
          expect(pane.axisColumns[0]!.width).toBe(requested)
          expect(geometry.find((entry) => entry.id === pane.id)?.axisWidth).toBe(requested)
        }
        expect(chart.getDom().rightAxisLayer.style.width).toBe(`${requested}px`)
      }
    } finally {
      await chart.destroy()
    }
  })

  it('runtime synchronization does not commitLayout back to kernel', async () => {
    const chart = mountChart()
    try {
      const commit = vi.spyOn(chart.kernel.pane.actions, 'commitLayout')
      commit.mockClear()
      chart['runtimeProjection'].synchronize()
      expect(commit).not.toHaveBeenCalled()
    } finally {
      await chart.destroy()
    }
  })

  it('installs price axes before configuring layers through repeated pane migrations', async () => {
    const chart = mountChart()
    const errors = vi.spyOn(console, 'error')
    try {
      const id = 'price-axis-migration'
      registerPlotDefinition({
        id,
        name: id,
        source: 'native',
        position: 'main',
        inputs: {},
        compute: () => ({ plots: [], fills: [] }),
      })
      const instanceId = chart.indicators.add(id)!
      const first = chart.panes.addPane(MAIN_PANE_ID, 'above')!
      const second = chart.panes.addPane(MAIN_PANE_ID, 'below')!
      for (const paneId of [first, second, MAIN_PANE_ID]) {
        batch(() => {
          chart.indicators.move(instanceId, { kind: INSTANCE_MOVE_KIND.PANE, paneId })
          chart.kernel.pane.actions.setPaneScaleType(
            paneId === MAIN_PANE_ID ? PRICE_SERIES_AXIS_ID : axisGroupId(paneId, AXIS_GROUP_PRICE),
            ScaleType.Log,
          )
        })
        const binding = chart.axes.bindingFor(instanceId)
        expect(binding.paneId).toBe(paneId)
        const pane = chart
          .getPaneRenderers()
          .find((renderer) => renderer.getPane().id === paneId)!
          .getPane()
        expect(pane.axis(binding.axisId).getScaleType()).toBe(ScaleType.Log)
        expect(
          chart.getRenderer(resolveIndicatorLayerId(id, paneId, 'renderer', instanceId))?.pane,
        ).toBe(paneId)
        expect(chart.axes.configuration(binding.axisId).rangeMode).toBe(PRICE_AXIS_RANGE_MODE.All)
      }
      expect(chart.panes.hasPane(first)).toBe(false)
      expect(chart.panes.hasPane(second)).toBe(false)
      expect(errors).not.toHaveBeenCalled()
    } finally {
      await chart.destroy()
    }
  })

  it('keeps layers mounted when only axis configuration changes and keeps observing later migrations', async () => {
    const chart = mountChart()
    const errors = vi.spyOn(console, 'error')
    try {
      const id = 'projection-configuration'
      registerEmptyPlot(id)
      const instanceId = chart.indicators.add(id)!
      const original = chart.axes.bindingFor(instanceId)
      const layerId = resolveIndicatorLayerId(id, original.paneId, 'renderer', instanceId)
      const layer = chart.getRenderer(layerId)
      chart.axes.setScaleType(original.axisId, ScaleType.Log)
      expect(chart.getRenderer(layerId)).toBe(layer)
      chart.panes.updatePane(original.paneId, { ratio: 0.4 })
      expect(chart.axes.configuration(original.axisId).scaleType).toBe(ScaleType.Log)
      chart.kernel.pane.actions.setPaneScaleType(original.axisId, ScaleType.Linear)
      expect(chart.axes.configuration(original.axisId).scaleType).toBe(ScaleType.Linear)
      chart.axes.setScaleType(original.axisId, ScaleType.Percent, 10)
      expect(chart.axes.configuration(original.axisId).baseValue).toBe(10)
      expect(chart.getRenderer(layerId)).toBe(layer)
      chart.indicators.move(instanceId, { kind: INSTANCE_MOVE_KIND.PANE, paneId: MAIN_PANE_ID })
      expect(chart.axes.bindingFor(instanceId).paneId).toBe(MAIN_PANE_ID)
      expect(chart.panes.hasPane(original.paneId)).toBe(false)
      expect(errors).not.toHaveBeenCalled()
    } finally {
      await chart.destroy()
    }
  })

  it('derives the initial primary scale from settings without writing projection defaults into layout', async () => {
    const chart = mountChart(
      1000,
      600,
      createTestChartRuntime({
        initialSettings: { mainRightAxisTypeSetting: ScaleType.Log },
      }),
    )
    try {
      expect(chart.axes.configuration(PRICE_SERIES_AXIS_ID).scaleType).toBe(ScaleType.Log)
      expect(chart.kernel.pane.readonly.paneScaleTypes.peek().has(PRICE_SERIES_AXIS_ID)).toBe(false)
    } finally {
      await chart.destroy()
    }
  })

  it('restores all panes before definitions arrive and keeps geometry and configuration stable as content loads', async () => {
    const chart = mountChart(1000, 1000)
    try {
      const document = chart.kernel.createLayout()
      const paneSpecs = [
        { id: 'main', ratio: 0.6 },
        { id: 'late-pane-a', ratio: 0.25 },
        { id: 'late-pane-b', ratio: 0.15 },
      ]
      chart.kernel.applyLayout({
        ...document,
        workspaces: {
          ...document.workspaces,
          kline: {
            instances: paneSpecs.slice(1).map((pane, index) => ({
              instanceId: `late-instance-${index}`,
              indicatorId: pane.id,
              paneId: pane.id,
              role: 'sub',
              ordinal: 0,
              params: {},
            })),
            paneSpecs,
            paneScaleTypes: { 'late-pane-a': 'log' },
          },
        },
      })
      chart.draw()
      const baseline = chart.kernel.exportLayout().workspaces
      const panes = chart.getPaneRenderers().map((renderer) => renderer.getPane())
      const heights = panes.map((pane) => pane.height)
      expect(panes.map((pane) => pane.id)).toEqual(paneSpecs.map((pane) => pane.id))
      expect(chart.indicators.subPanes.peek()).toHaveLength(2)
      expect(heights[1]! / heights[2]!).toBeCloseTo(0.25 / 0.15, 1)
      const commit = vi.spyOn(chart.kernel.pane.actions, 'commitLayout')

      for (const pane of paneSpecs.slice(1)) {
        registerEmptyPlot(pane.id)
        chart.draw()
        const instance = chart.indicators.instances
          .peek()
          .find((entry) => entry.paneId === pane.id)!
        expect(
          chart.getRenderer(resolveIndicatorLayerId(pane.id, pane.id, 'renderer', instance.id)),
        ).toBeDefined()
        chart
          .getPaneRenderers()
          .forEach((renderer, index) => expect(renderer.getPane()).toBe(panes[index]))
        expect(panes.map((entry) => entry.height)).toEqual(heights)
        expect(chart.kernel.exportLayout().workspaces).toEqual(baseline)
      }

      for (const height of [300, 1000]) {
        ResizeObserverMock.instances[0]!.emit({
          contentRect: DOMRect.fromRect({ width: 1000, height }),
          contentBoxSize: [{ inlineSize: 1000, blockSize: height }],
        })
        chart.draw()
        expect(chart.kernel.exportLayout().workspaces).toEqual(baseline)
      }
      expect(panes.map((pane) => pane.height)).toEqual(heights)
      expect(commit).not.toHaveBeenCalled()
      expect(chart.kernel.pane.readonly.paneScaleTypes.peek().get('late-pane-a')).toBe('log')
    } finally {
      await chart.destroy()
    }
  })

  it('applies ratio patches without remounting indicator layers or publishing unchanged layouts', async () => {
    const chart = mountChart(1000, 1000)
    try {
      const id = 'layout-resource-fixture'
      registerEmptyPlot(id)
      const instanceId = chart.indicators.add(id)!
      const paneId = chart.indicators.instances
        .peek()
        .find((instance) => instance.id === instanceId)!.paneId!
      const layerId = resolveIndicatorLayerId(id, paneId, 'renderer', instanceId)
      const layer = chart.getRenderer(layerId)
      expect(layer).toBeDefined()
      const observer = new MutationObserver(() => {})
      observer.observe(chart.getDom().rightAxisLayer, { childList: true })
      expect(chart.panes.updatePane(MAIN_PANE_ID, { ratio: 0.25 })).toBe(true)
      expect(chart.paneRatios.peek()).toEqual({ main: 0.5, [paneId]: 0.5 })
      expect(chart.getRenderer(layerId)).toBe(layer)
      expect(observer.takeRecords()).toEqual([])
      observer.disconnect()
      const notify = vi.fn()
      const unsubscribe = chart.kernel.pane.readonly.workspaces.subscribe(notify)
      const baseline = chart.paneLayout.peek()
      chart.panes.updatePane(MAIN_PANE_ID, { ratio: chart.paneRatios.peek()[MAIN_PANE_ID]! })
      chart.panes.updatePane(MAIN_PANE_ID, {})
      expect(chart.paneLayout.peek()).toBe(baseline)
      expect(notify).not.toHaveBeenCalled()
      expect(chart.panes.updatePane(MAIN_PANE_ID, { ratio: Number.NaN })).toBe(false)
      expect(chart.panes.updatePane(MAIN_PANE_ID, { ratio: -1 })).toBe(false)
      unsubscribe()
    } finally {
      await chart.destroy()
    }
  })

  it('clears hidden geometry and uses visible adjacency for hit testing, including after drawing', async () => {
    const chart = mountChart(1000, 1000)
    try {
      importPaneFixture(chart)
      const hidden = chart
        .getPaneRenderers()
        .find((renderer) => renderer.getPane().id === 'layout-a')!
      const oldCenter = hidden.getPane().top + hidden.getPane().height / 2
      chart.panes.updatePane('layout-a', { visible: false })
      chart.draw()
      expect(hidden.getPane().height).toBe(0)
      expect(hidden.getDom().mainCanvas.height).toBe(0)
      const geometry = chart.kernel.pane.readonly.paneGeometry.peek()
      expect(geometry.map((pane) => pane.id)).toEqual([MAIN_PANE_ID, 'layout-b'])
      expect(chart.interaction['getPaneByY'](oldCenter)?.id).not.toBe('layout-a')
      const first = geometry[0]!
      const last = geometry[1]!
      expect(chart.interaction['hitTestPaneSeparator'](first.top + first.height)).toBe(MAIN_PANE_ID)
      expect(chart.interaction['hitTestPaneSeparator'](last.top + last.height)).toBeNull()
      expect(chart.panes.beginBoundaryResize('layout-a')).toBeNull()
      chart.panes.updatePane(MAIN_PANE_ID, { visible: false })
      chart.panes.updatePane('layout-b', { visible: false })
      expect(chart.kernel.pane.readonly.paneGeometry.peek()).toEqual([])
      expect(chart.interaction['getPaneByY'](0)).toBeNull()
      expect(chart.interaction['hitTestPaneSeparator'](0)).toBeNull()
    } finally {
      await chart.destroy()
    }
  })

  it('fits panes and gaps into a container shorter than their combined minimum heights', async () => {
    const chart = mountChart(1000, 50)
    try {
      importPaneFixture(chart)
      chart.updateOptions({ paneGap: 3 })
      chart.draw()
      const geometry = chart.kernel.pane.readonly.paneGeometry.peek()
      const height = chart.getViewport()!.plotHeight
      expect(geometry).toHaveLength(3)
      expect(geometry.every((pane) => pane.height > 0 && pane.top + pane.height <= height)).toBe(
        true,
      )
      expect(geometry.reduce((sum, pane) => sum + pane.height, 0) + 6).toBe(height)
      expect(geometry.at(-1)!.top + geometry.at(-1)!.height).toBe(height)
    } finally {
      await chart.destroy()
    }
  })

  it('uses the initial drag snapshot regardless of move frequency and changes only adjacent panes', async () => {
    const chart = mountChart(1000, 1000)
    try {
      importPaneFixture(chart)
      const geometry = chart.kernel.pane.readonly.paneGeometry.peek()
      const session = chart.panes.beginBoundaryResize(MAIN_PANE_ID)!
      for (const delta of [0.2, 0.4, 0.6, 1.2, 12.4, 100.4]) session.resize(delta)
      const stepped = chart.paneLayout.peek()
      expect(chart.kernel.pane.readonly.paneGeometry.peek()[2]!.height).toBe(geometry[2]!.height)
      importPaneFixture(chart)
      const direct = chart.panes.beginBoundaryResize(MAIN_PANE_ID)!
      direct.resize(100.4)
      expect(chart.paneLayout.peek()).toEqual(stepped)
      direct.resize(10000)
      expect(chart.kernel.pane.readonly.paneGeometry.peek()[1]!.height).toBe(40)
      expect(chart.kernel.pane.readonly.paneGeometry.peek()[2]!.height).toBe(geometry[2]!.height)
      direct.resize(0)
      expect(chart.kernel.pane.readonly.paneGeometry.peek()).toEqual(geometry)
      chart.panes.updatePane('layout-b', { visible: false })
      const changed = chart.paneLayout.peek()
      expect(direct.resize(10)).toBe(false)
      expect(chart.paneLayout.peek()).toBe(changed)
    } finally {
      await chart.destroy()
    }
  })

  it('restores original weights on returning a constrained drag to its origin', async () => {
    const chart = mountChart(1000, 1000)
    try {
      importPaneFixture(chart)
      chart.panes.updatePane('layout-a', { minHeightPx: 300 })
      const initial = chart.paneLayout.peek()
      const session = chart.panes.beginBoundaryResize(MAIN_PANE_ID)!
      expect(session.resize(-25)).toBe(true)
      expect(session.resize(0)).toBe(true)
      expect(chart.paneLayout.peek()).toEqual(initial)
      chart.updateOptions({ paneGap: 4 })
      expect(session.resize(25)).toBe(false)
    } finally {
      await chart.destroy()
    }
  })

  it('reorders all pane identities in one publication and preserves their content', async () => {
    const chart = mountChart()
    try {
      importPaneFixture(chart)
      const notify = vi.fn()
      const unsubscribe = chart.paneLayout.subscribe(notify)
      const ids = ['layout-b', MAIN_PANE_ID, 'layout-a']
      expect(chart.panes.reorderPanes(ids)).toBe(true)
      expect(chart.paneLayout.peek().map((pane) => pane.id)).toEqual(ids)
      expect(
        chart
          .getPaneRenderers()
          .find((renderer) => renderer.getPane().id === MAIN_PANE_ID)!
          .getPane()
          .axes.some((axis) => axis.axisId === PRICE_SERIES_AXIS_ID),
      ).toBe(true)
      expect(chart.panes.getLayoutSpecs()).toEqual(chart.paneLayout.peek())
      expect(notify).toHaveBeenCalledOnce()
      chart.panes.reorderPanes(ids)
      expect(notify).toHaveBeenCalledOnce()
      expect(chart.panes.reorderPanes([MAIN_PANE_ID, MAIN_PANE_ID, 'layout-a'])).toBe(false)
      unsubscribe()
    } finally {
      await chart.destroy()
    }
  })

  it('starts with a 3:1 split, preserves proportions on addition and persists boundary changes', async () => {
    const chart = mountChart(1000, 1000)
    try {
      const indicatorId = 'pane-ratio-fixture'
      registerEmptyPlot(indicatorId)
      const first = chart.indicators.add(indicatorId)
      expect(first).not.toBeNull()
      const paneId = chart.indicators.instances
        .peek()
        .find((instance) => instance.paneId !== MAIN_PANE_ID)!.paneId!
      expect(chart.paneRatios.peek().main).toBeCloseTo(0.75)
      expect(chart.paneRatios.peek()[paneId]).toBeCloseTo(0.25)
      chart.panes.updatePane('main', { ratio: 0.8 })
      chart.panes.updatePane(paneId, { ratio: 0.2 })
      const previous = chart.paneRatios.peek()
      chart.indicators.add(indicatorId)
      const next = chart.paneRatios.peek()
      expect(next.main! / next[paneId]!).toBeCloseTo(previous.main! / previous[paneId]!)
      chart.draw()
      expect(chart.panes.resizeBoundary('main', -40)).toBe(true)
      const resized = chart.kernel.exportLayout().workspaces
      expect(resized.kline.paneSpecs).not.toEqual(
        chart.kernel.createLayout().workspaces.kline.paneSpecs,
      )
      chart.resize()
      chart.draw()
      expect(chart.kernel.exportLayout().workspaces).toEqual(resized)
    } finally {
      await chart.destroy()
    }
  })

  it('sorts panes and their indicator rows independently for added and moved instances', async () => {
    const chart = mountChart()
    const definitionId = 'independent-order'
    registerEmptyPlot(definitionId)
    try {
      const first = chart.indicators.add(definitionId)!
      const second = chart.indicators.add(definitionId)!
      const moved = chart.indicators.add(definitionId, {}, 'main')!
      chart.legend.moveTo(moved, {
        kind: 'newPane',
        anchorPaneId: MAIN_PANE_ID,
        placement: 'below',
      })
      const paneOf = (id: string) =>
        chart.kernel.indicator.readonly.instances
          .peek()
          .find((instance) => instance.instanceId === id)!.paneId
      const order = () => chart.panes.getLayoutSpecs().map((pane) => pane.id)
      const contexts = () =>
        chart.getPaneRenderers().map((renderer) =>
          createMockRenderContext({
            pane: { id: renderer.getPane().id, top: renderer.getPane().top },
          }),
        )
      const actions = (id: string) => {
        chart.legend.projectFrame(contexts())
        return chart.legend.rows.peek().find((row) => row.key === id)!.actions
      }
      expect(actions(moved).find((action) => action.action === 'move-pane-up')!.enabled).toBe(true)
      expect(actions(moved).find((action) => action.action === 'move-pane-down')!.enabled).toBe(
        true,
      )
      expect(
        actions(moved).some(
          (action) => action.action === 'move-up' || action.action === 'move-down',
        ),
      ).toBe(false)
      const firstPane = paneOf(first)
      const movedPane = paneOf(moved)
      chart.legend.execute(moved, 'move-pane-down')
      expect(order()).toEqual([MAIN_PANE_ID, firstPane, movedPane, paneOf(second)])
      expect(paneOf(moved)).toBe(movedPane)
      chart.legend.execute(moved, 'move-pane-up')
      expect(order()).toEqual([MAIN_PANE_ID, movedPane, firstPane, paneOf(second)])
      chart.legend.moveTo(moved, { kind: 'pane', paneId: firstPane })
      const paneOrder = order()
      expect(actions(moved).find((action) => action.action === 'move-up')!.enabled).toBe(true)
      chart.legend.execute(moved, 'move-up')
      expect(
        chart.legend
          .list()
          .filter((entry) => entry.paneId === firstPane)
          .map((entry) => entry.id),
      ).toEqual([moved, first])
      expect(order()).toEqual(paneOrder)
      chart.legend.execute(moved, 'move-down')
      expect(
        chart.legend
          .list()
          .filter((entry) => entry.paneId === firstPane)
          .map((entry) => entry.id),
      ).toEqual([first, moved])
      chart.legend.execute(first, 'move-pane-down')
      expect(order()).toEqual([MAIN_PANE_ID, paneOf(second), firstPane])
      expect(paneOf(moved)).toBe(firstPane)
      expect(actions(first).find((action) => action.action === 'move-pane-down')!.enabled).toBe(
        false,
      )
    } finally {
      await chart.destroy()
    }
  })

  it('can turn off a restored main log axis when settings are already linear', async () => {
    const source = mountChart()
    source.axes.setScaleType(PRICE_SERIES_AXIS_ID, ScaleType.Log)
    const workspaces = source.kernel.snapshotViewWorkspaces()
    await source.destroy()
    const chart = mountChart(
      1000,
      600,
      createTestChartRuntime({
        initialSettings: { mainRightAxisTypeSetting: ScaleType.Linear },
      }),
    )
    try {
      chart.kernel.applyLayout({
        version: LAYOUT_DOCUMENT_VERSION,
        workspaces,
        panePriceAxisModes: {},
      })
      expect(chart.kernel.pane.readonly.paneScaleTypes.peek().get(PRICE_SERIES_AXIS_ID)).toBe(
        ScaleType.Log,
      )
      chart.axes.setScaleType(PRICE_SERIES_AXIS_ID, ScaleType.Linear)
      expect(chart.kernel.pane.readonly.paneScaleTypes.peek().get(PRICE_SERIES_AXIS_ID)).toBe(
        ScaleType.Linear,
      )
      expect(chart.getPaneRenderers()[0]?.getPane().yAxis.getScaleType()).toBe(ScaleType.Linear)
    } finally {
      await chart.destroy()
    }
  })
})
