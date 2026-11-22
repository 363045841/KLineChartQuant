// @vitest-environment jsdom
/** 指标实例的增删、迁移、对象树投影、轴合并与图元借用轴回归。 */
import { describe, expect, it, vi } from 'vitest'
import { PRICE_AXIS_RANGE_MODE } from '@/foundation/config/priceAxisRangeMode.js'
import { objectAxisId } from '@/foundation/geometry/axisBinding.js'
import { ScaleType } from '@/foundation/types/scaleType'
import {
  registerEmptyPlot,
  registerPlotDefinition,
} from '../indicators/__tests__/helpers/plotIndicatorTestKit'
import { resolveIndicatorLayerId } from '../indicators/indicatorLayerNaming'
import { AXIS_GROUP_DRAWING, axisGroupId } from '../pane/axisGroups.js'
import { MAIN_PANE_ID } from '../pane/types'
import { PRICE_SERIES_AXIS_ID } from '../renderers/rendererIds.js'
import {
  importPaneFixture,
  installChartTestHooks,
  mountChart,
} from './helpers/chartLifecycleTestKit'

describe('Chart indicator commands', () => {
  installChartTestHooks()

  it('adds a main-chart indicator to MAIN_PANE_ID after the main pane is moved', async () => {
    const chart = mountChart()
    try {
      importPaneFixture(chart)
      chart.panes.reorderPanes(['layout-b', MAIN_PANE_ID, 'layout-a'])
      const id = 'main-overlay-after-reorder'
      registerPlotDefinition({
        id,
        name: id,
        source: 'native',
        position: 'main',
        inputs: {},
        compute: () => ({ plots: [], fills: [] }),
      })
      const instanceId = chart.indicators.add(id, undefined, 'main')!
      const instance = chart.indicators.instances.peek().find((item) => item.id === instanceId)!
      expect(instance.paneId).toBe(MAIN_PANE_ID)
    } finally {
      await chart.destroy()
    }
  })

  it('removes only matching definition instances from a merged pane in one publication', async () => {
    const chart = mountChart()
    try {
      registerEmptyPlot('merged-layout-a')
      registerEmptyPlot('merged-layout-b')
      const first = chart.indicators.add('merged-layout-a')!
      const paneId = chart.indicators.instances.peek().find((instance) => instance.id === first)!
        .paneId!
      const second = chart.indicators.add('merged-layout-a')!
      chart.indicators.move(second, { kind: 'pane', paneId })
      const retained = chart.indicators.add('merged-layout-b')!
      chart.indicators.move(retained, { kind: 'pane', paneId })
      const notify = vi.fn()
      const unsubscribe = chart.kernel.indicator.readonly.instances.subscribe(notify)
      chart.indicators.removeByDefinition('merged-layout-a')
      expect(chart.indicators.instances.peek().map((instance) => instance.id)).toEqual([retained])
      expect(chart.panes.hasPane(paneId)).toBe(true)
      expect(notify).toHaveBeenCalledOnce()
      chart.indicators.removeByDefinition('merged-layout-b')
      expect(chart.panes.hasPane(paneId)).toBe(false)
      unsubscribe()
    } finally {
      await chart.destroy()
    }
  })

  it('clearAllIndicators removes main and sub instances and recycles sub panes', async () => {
    const chart = mountChart(1000, 1000)
    try {
      registerPlotDefinition({
        id: 'clear-all-main',
        name: 'clear-all-main',
        source: 'script',
        position: 'main',
        inputs: {},
        compute: () => ({ plots: [], fills: [] }),
      })
      registerEmptyPlot('clear-all-sub')
      expect(chart.indicators.add('clear-all-main')).not.toBeNull()
      expect(chart.indicators.add('clear-all-sub')).not.toBeNull()
      const instances = chart.kernel.indicator.readonly.instances.peek()
      const subPane = instances.find((instance) => instance.paneId !== MAIN_PANE_ID)
      const mainInstance = instances.find((instance) => instance.paneId === MAIN_PANE_ID)
      if (subPane?.paneId === undefined || mainInstance === undefined)
        throw new Error('fixture requires main and sub instances')
      const subAxisKey = objectAxisId(subPane.instanceId)
      chart.kernel.pane.actions.setPaneScaleType(subAxisKey, ScaleType.Log)

      chart.indicators.clear()

      expect(chart.indicators.instances.peek()).toHaveLength(0)
      expect(chart.panes.getLayoutSpecs().map((spec) => spec.id)).toEqual([MAIN_PANE_ID])
      expect(chart.panes.hasPane(subPane.paneId)).toBe(false)
      expect(chart.kernel.pane.readonly.paneScaleTypes.peek().has(subAxisKey)).toBe(false)
      expect(
        chart.kernel.pane.readonly.paneScaleTypes.peek().has(objectAxisId(mainInstance.instanceId)),
      ).toBe(false)
      chart.indicators.clear()
      expect(chart.indicators.instances.peek()).toHaveLength(0)
    } finally {
      await chart.destroy()
    }
  })

  it('removeInstancesByDefinition removes only matching instances and their panes', async () => {
    const chart = mountChart(1000, 1000)
    try {
      registerEmptyPlot('definition-a')
      registerEmptyPlot('definition-b')
      expect(chart.indicators.add('definition-a')).not.toBeNull()
      expect(chart.indicators.add('definition-b')).not.toBeNull()
      const instances = chart.kernel.indicator.readonly.instances.peek()
      const first = instances.find((instance) => instance.indicatorId === 'definition-a')
      const second = instances.find((instance) => instance.indicatorId === 'definition-b')
      if (first?.paneId === undefined || second?.paneId === undefined)
        throw new Error('fixture requires two sub panes')
      const firstAxisKey = objectAxisId(first.instanceId)
      chart.kernel.pane.actions.setPaneScaleType(firstAxisKey, ScaleType.Log)

      chart.indicators.removeByDefinition('definition-a')

      expect(
        chart.kernel.indicator.readonly.instances.peek().map((instance) => instance.indicatorId),
      ).toEqual(['definition-b'])
      expect(chart.panes.hasPane(first.paneId)).toBe(false)
      expect(chart.panes.hasPane(second.paneId)).toBe(true)
      expect(chart.kernel.pane.readonly.paneScaleTypes.peek().has(firstAxisKey)).toBe(false)
    } finally {
      await chart.destroy()
    }
  })

  it('definition replacement keeps explicit instance placement in both workspaces', async () => {
    const chart = mountChart(1000, 1000)
    const definition = {
      id: 'placement-script',
      name: 'Placement script',
      source: 'script' as const,
      inputs: {},
      compute: () => ({ plots: [], fills: [] }),
    }
    try {
      registerPlotDefinition(definition)
      const first = chart.indicators.add(definition.id)
      chart.kernel.actions.setDataView('timeshare')
      const second = chart.indicators.add(definition.id)
      const baseline = chart.kernel.snapshotViewWorkspaces()
      registerPlotDefinition({ ...definition, position: 'main' })
      expect(chart.kernel.snapshotViewWorkspaces()).toEqual(baseline)
      registerPlotDefinition({ ...definition, position: 'sub' })
      expect(chart.kernel.snapshotViewWorkspaces()).toEqual(baseline)
      expect(first).not.toBeNull()
      expect(second).not.toBeNull()
    } finally {
      await chart.destroy()
    }
  })

  it.each<'main' | 'sub'>(['main', 'sub'])(
    'moves a %s instance through every pane target with one live layer',
    async (position) => {
      const chart = mountChart(1000, 1000)
      const definitionId = `moving-${position}`
      registerPlotDefinition({
        id: definitionId,
        name: definitionId,
        source: 'script',
        position,
        inputs: {},
        compute: () => ({ plots: [], fills: [] }),
      })
      registerEmptyPlot(`target-${position}`)
      try {
        const targetId = chart.indicators.add(`target-${position}`)!
        const targetPaneId = chart.kernel.indicator.readonly.instances
          .peek()
          .find((instance) => instance.instanceId === targetId)!.paneId
        const instanceId = chart.indicators.add(definitionId, { custom: 7 })!
        const mainPane = chart
          .getPaneRenderers()
          .find((renderer) => renderer.getPane().id === MAIN_PANE_ID)!
          .getPane()
        const targets: import('../legend/types').LegendMoveTarget[] = [
          { kind: 'pane', paneId: targetPaneId },
          { kind: 'pane', paneId: MAIN_PANE_ID },
          { kind: 'newPane', anchorPaneId: MAIN_PANE_ID, placement: 'above' },
          { kind: 'newPane', anchorPaneId: MAIN_PANE_ID, placement: 'below' },
          { kind: 'pane', paneId: targetPaneId },
          { kind: 'pane', paneId: MAIN_PANE_ID },
        ]
        for (const target of targets) {
          const before = chart.kernel.indicator.readonly.instances
            .peek()
            .find((instance) => instance.instanceId === instanceId)!
          const oldId = resolveIndicatorLayerId(definitionId, before.paneId, 'renderer', instanceId)
          const oldLayer = chart.getRenderer(oldId)!
          const disposed = vi.spyOn(oldLayer, 'dispose')
          expect(chart.legend.moveTo(instanceId, target)).toBe(true)
          const current = chart.kernel.indicator.readonly.instances
            .peek()
            .find((instance) => instance.instanceId === instanceId)!
          const layerId = resolveIndicatorLayerId(
            definitionId,
            current.paneId,
            'renderer',
            instanceId,
          )
          const layer = chart.getRenderer(layerId)!
          expect(layer).toBeDefined()
          expect(layer.pane).toBe(current.paneId)
          expect(layer.visible).toBe(true)
          expect(disposed).toHaveBeenCalledTimes(1)
          expect(current.params).toEqual({ custom: 7 })
          expect(
            chart['renderer']
              .getScene()
              .layers.peek()
              .filter((candidate) => candidate.id.endsWith(`@${instanceId}`)),
          ).toHaveLength(1)
          const pane = chart
            .getPaneRenderers()
            .find((renderer) => renderer.getPane().id === current.paneId)!
            .getPane()
          // 主图指标并入价格轴；副图指标按定义独占一条轴；新 Pane 里对象即该 Pane 的主轴。
          const expectedAxes =
            current.paneId === MAIN_PANE_ID
              ? position === 'main'
                ? 1
                : 2
              : current.paneId === targetPaneId
                ? 2
                : 1
          expect(pane.axes.length).toBe(expectedAxes)
          expect(new Set(pane.axes.map((axis) => axis.axisId)).size).toBe(pane.axes.length)
          expect(
            chart
              .getPaneRenderers()
              .find((renderer) => renderer.getPane().id === MAIN_PANE_ID)!
              .getPane(),
          ).toBe(mainPane)
          if (before.paneId !== MAIN_PANE_ID && before.paneId !== targetPaneId)
            expect(chart.panes.hasPane(before.paneId), 'source pane recycled').toBe(false)
          if (target.kind === 'newPane') {
            const ids = chart.panes.getLayoutSpecs().map((spec) => spec.id)
            expect(ids.indexOf(current.paneId) - ids.indexOf(MAIN_PANE_ID)).toBe(
              target.placement === 'above' ? -1 : 1,
            )
          }
          chart.draw()
        }
        expect(chart.indicators.update(instanceId, { hidden: true })).toBe(true)
        // 隐藏只关闭可见性：对象常驻，才能从对象树重新打开。
        expect(
          chart.getRenderer(
            resolveIndicatorLayerId(definitionId, MAIN_PANE_ID, 'renderer', instanceId),
          )?.visible,
        ).toBe(false)
        expect(chart.legend.moveTo(instanceId, { kind: 'pane', paneId: targetPaneId })).toBe(true)
        expect(chart.indicators.update(instanceId, { hidden: false, params: { custom: 9 } })).toBe(
          true,
        )
        const finalId = resolveIndicatorLayerId(definitionId, targetPaneId, 'renderer', instanceId)
        expect(chart.getRenderer(finalId)?.pane).toBe(targetPaneId)
        expect(chart.indicators.remove(instanceId)).toBe(true)
        expect(chart.getRenderer(finalId), 'final layer removed').toBeUndefined()
        expect(chart.panes.hasPane(targetPaneId), 'target pane kept').toBe(true)
      } finally {
        await chart.destroy()
      }
    },
  )

  it('projects indicators into the object tree and routes commands through pane APIs', async () => {
    const chart = mountChart()
    const definitionId = 'object-tree-indicator'
    registerPlotDefinition({
      id: definitionId,
      name: definitionId,
      source: 'script',
      position: 'main',
      inputs: {},
      compute: () => ({ plots: [], fills: [] }),
    })
    try {
      const instanceId = chart.indicators.add(definitionId)!
      const locate = () =>
        chart.objects.groups
          .peek()
          .find((group) => group.paneId === MAIN_PANE_ID)
          ?.rows.find((row) => row.objectId.endsWith(`@${instanceId}`))

      const row = locate()
      if (row === undefined) throw new Error('indicator row missing')
      expect(row).toMatchObject({ kind: 'indicator', visible: true, locked: false })
      expect(row.capabilities).toMatchObject({
        removable: true,
        hideable: true,
        orderable: true,
        movable: true,
        lockable: false,
      })

      const commands = chart.objects.commandsFor(row.objectId)
      if (commands === null) throw new Error('indicator commands missing')
      // 指标不参与锁定；显隐照常，隐藏后对象仍在树中。
      expect(commands.setLocked(true)).toBe(false)
      expect(commands.setVisible(false)).toBe(true)
      expect(locate()?.visible).toBe(false)
      expect(commands.setVisible(true)).toBe(true)
      expect(commands.remove()).toBe(true)
      expect(locate()).toBeUndefined()
    } finally {
      await chart.destroy()
    }
  })

  it('maps instance ordinal onto layer z so object order is render order', async () => {
    const chart = mountChart()
    const definitionId = 'object-tree-order'
    registerPlotDefinition({
      id: definitionId,
      name: definitionId,
      source: 'script',
      position: 'main',
      inputs: {},
      compute: () => ({ plots: [], fills: [] }),
    })
    try {
      const firstId = chart.indicators.add(definitionId)!
      const secondId = chart.indicators.add(definitionId)!
      const firstLayerId = resolveIndicatorLayerId(definitionId, MAIN_PANE_ID, 'renderer', firstId)
      const secondLayerId = resolveIndicatorLayerId(
        definitionId,
        MAIN_PANE_ID,
        'renderer',
        secondId,
      )
      expect(chart.getRenderer(secondLayerId)!.z).toBeGreaterThan(
        chart.getRenderer(firstLayerId)!.z,
      )

      const commands = chart.objects.commandsFor(secondLayerId)
      if (commands === null) throw new Error('indicator commands missing')
      expect(commands.move({ kind: 'pane', paneId: MAIN_PANE_ID, index: 0 })).toBe(true)

      // 顺序写回 ordinal 后，绘制层 z 同步反转，对象树与画面一致。
      expect(chart.getRenderer(secondLayerId)!.z).toBeLessThan(chart.getRenderer(firstLayerId)!.z)

      // 拖到最底端分割线：新建 Pane，并走同一套 Pane 领域命令。
      const paneCount = chart.panes.getLayoutSpecs().length
      expect(
        commands.move({ kind: 'newPane', anchorPaneId: MAIN_PANE_ID, placement: 'below' }),
      ).toBe(true)
      expect(chart.panes.getLayoutSpecs().length).toBe(paneCount + 1)
      const movedPane = chart.kernel.indicator.readonly.instances
        .peek()
        .find((instance) => instance.instanceId === secondId)?.paneId
      expect(movedPane).not.toBe(MAIN_PANE_ID)
    } finally {
      await chart.destroy()
    }
  })

  it('同量纲合并轴：主图并入价格轴，副图按定义合并，迁移重绑目标轴', async () => {
    const chart = mountChart()
    registerPlotDefinition({
      id: 'axis-main-overlay',
      name: 'axis-main-overlay',
      source: 'script',
      position: 'main',
      inputs: {},
      compute: () => ({ plots: [], fills: [] }),
    })
    registerEmptyPlot('axis-object-a')
    registerEmptyPlot('axis-object-b')
    const paneOf = (instanceId: string) =>
      chart.kernel.indicator.readonly.instances
        .peek()
        .find((instance) => instance.instanceId === instanceId)!.paneId
    const axesOf = (paneId: string) =>
      chart
        .getPaneRenderers()
        .find((renderer) => renderer.getPane().id === paneId)!
        .getPane().axes
    try {
      // 主图指标与价格序列共用价格轴，右轴列数不随对象增加。
      const overlay = chart.indicators.add('axis-main-overlay', {}, 'main')!
      expect(chart.axes.bindingFor(overlay).axisId).toBe(PRICE_SERIES_AXIS_ID)
      expect(axesOf(MAIN_PANE_ID)).toHaveLength(1)

      // 副图：不同定义各一条轴，同一定义的多实例合并。
      const first = chart.indicators.add('axis-object-a')!
      const paneId = paneOf(first)
      const second = chart.indicators.add('axis-object-b')!
      chart.indicators.move(second, { kind: 'pane', paneId })
      const third = chart.indicators.add('axis-object-b')!
      chart.indicators.move(third, { kind: 'pane', paneId })
      const a = chart.axes.bindingFor(first)
      const b = chart.axes.bindingFor(second)
      expect(a.axisId).not.toBe(b.axisId)
      expect(chart.axes.bindingFor(third).axisId).toBe(b.axisId)
      expect(axesOf(paneId)).toHaveLength(2)

      // 轴配置按轴生效，同轴对象共享同一份坐标语义。
      chart.axes.setScaleType(b.axisId, ScaleType.Log)
      expect(chart.axes.configuration(a.axisId).scaleType).toBe(ScaleType.Linear)
      expect(chart.axes.configuration(b.axisId).scaleType).toBe(ScaleType.Log)
      expect(() => chart.axes.setScaleType(a.axisId, ScaleType.Percent)).toThrow('基准值')
      expect(chart.axes.configuration(a.axisId).scaleType).toBe(ScaleType.Linear)
      chart.axes.setScaleType(a.axisId, ScaleType.Percent, 100)
      expect(chart.axes.get(a.axisId).toPercent(110)).toBe(10)
      expect(chart.kernel.exportLayout().axisBaseValues?.[a.axisId]).toBe(100)
      chart.axes.setRangeMode(b.axisId, PRICE_AXIS_RANGE_MODE.Manual)

      // 迁移到新 Pane：轴属于 Pane 的量纲组，对象重绑目标轴，旧轴配置不随对象走。
      const destination = chart.panes.addPane(MAIN_PANE_ID, 'below')!
      chart.indicators.move(second, { kind: 'pane', paneId: destination })
      const moved = chart.axes.bindingFor(second)
      expect(moved.paneId).toBe(destination)
      expect(moved.axisId).not.toBe(b.axisId)
      expect(chart.axes.configuration(moved.axisId)).toMatchObject({
        scaleType: ScaleType.Linear,
        rangeMode: PRICE_AXIS_RANGE_MODE.All,
      })
      // 源 Pane 仍保留同定义另一实例的轴。
      expect(chart.axes.bindingFor(third).axisId).toBe(b.axisId)

      const before = chart.axes.list()
      expect(() => chart.indicators.move(first, { kind: 'pane', paneId: 'missing' })).toThrow(
        'missing',
      )
      expect(chart.axes.list()).toEqual(before)
      expect(() => chart.axes.setScaleType('missing', ScaleType.Linear)).toThrow('missing')
      chart.indicators.remove(third)
      chart.indicators.remove(second)
      expect(() => chart.axes.get(moved.axisId)).toThrow(moved.axisId)
    } finally {
      await chart.destroy()
    }
  })

  it('手绘横线借用指标所在窗格的主轴，移除指标后由窗格提供共享轴', async () => {
    const chart = mountChart()
    registerEmptyPlot('drawing-host')
    try {
      const indicatorId = chart.indicators.add('drawing-host')!
      const { paneId, axisId } = chart.axes.bindingFor(indicatorId)
      const pane = chart
        .getPaneRenderers()
        .find((renderer) => renderer.getPane().id === paneId)!
        .getPane()
      const axis = pane.axis(axisId)
      const drawing = chart.drawingCommands.create({
        kind: 'horizontal-line',
        paneId,
        anchors: [{ price: 100 }],
        style: { stroke: '#2962ff' },
      })
      expect(pane.axes).toEqual([{ axisId, yAxis: axis }])
      expect(pane.objectAxis(drawing.id)).toBeNull()
      expect(chart.axes.list().filter((binding) => binding.paneId === paneId)).toEqual([
        { paneId, axisId, objectId: indicatorId },
      ])

      chart.indicators.remove(indicatorId)
      const sharedAxis = axisGroupId(paneId, AXIS_GROUP_DRAWING)
      expect(pane.axes).toEqual([{ axisId: sharedAxis, yAxis: chart.axes.get(sharedAxis) }])
      expect(pane.objectAxis(drawing.id)).toBeNull()
      expect(chart.drawingCommands.remove(drawing.id)).toBe(true)
      expect(() => chart.axes.get(sharedAxis)).toThrow(sharedAxis)
    } finally {
      await chart.destroy()
    }
  })
})
