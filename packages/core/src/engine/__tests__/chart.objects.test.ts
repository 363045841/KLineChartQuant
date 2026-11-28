// @vitest-environment jsdom
/** 图元对象与系统对象的投影、命令路由、撤销重做与绘图会话回归。 */
import { describe, expect, it } from 'vitest'
import { createTrendLine } from '../drawing/__tests__/helpers/drawingTestKit'
import { indicatorLayerId, registerPlotDefinition } from '../indicators/__tests__/helpers/plotIndicatorTestKit'
import { MAIN_PANE_ID } from '../pane/types'
import { PRICE_SERIES_AXIS_ID } from '../renderers/rendererIds.js'
import { installChartTestHooks, mountChart } from './helpers/chartLifecycleTestKit'

describe('Chart drawing and system objects', () => {
  installChartTestHooks()

  it('setDrawingTool writes DrawingToolId to kernel', async () => {
    const { chart } = mountChart()
    try {
      expect(chart.kernel.drawing.readonly.drawingTool.peek()).toBe('cursor')
      chart.drawing.setTool('trend-line')
      expect(chart.kernel.drawing.readonly.drawingTool.peek()).toBe('trend-line')
      chart.drawing.setTool(null)
      expect(chart.kernel.drawing.readonly.drawingTool.peek()).toBe('cursor')
    } finally {
      await chart.destroy()
    }
  })

  it('projects user drawings as objects and routes drawing commands', async () => {
    const { chart } = mountChart()
    try {
      chart.drawing.setDrawings([createTrendLine('d-a'), createTrendLine('d-b')])
      const rowsOf = () =>
        chart.objects.groups.peek().find((group) => group.paneId === MAIN_PANE_ID)?.rows ?? []
      const drawingRows = () => rowsOf().filter((row) => row.kind === 'drawing')
      const drawingIds = () =>
        drawingRows().map((row) => (row.objectId.endsWith('d-a') ? 'd-a' : 'd-b'))

      // 同 z 时后注册的图元画在上面，列表也排在前面。
      expect(drawingIds()).toEqual(['d-b', 'd-a'])
      expect(drawingRows()[0]?.label).toBe('趋势线')
      expect(drawingRows()[0]?.capabilities.movable, 'movable').toBe(false)

      const top = drawingRows()[0]!
      const commands = chart.objects.commandsFor(top.objectId)
      if (commands === null) throw new Error('drawing commands missing')

      // 跨 pane 改变价格轴语义，命令层直接拒绝。
      expect(commands.move({ kind: 'pane', paneId: 'rsi', index: 0 }), 'cross-pane move').toBe(
        false,
      )

      // 锁定禁删除，但显隐与同 pane 排序照常。
      expect(commands.setLocked(true)).toBe(true)
      expect(commands.remove(), 'locked remove').toBe(false)
      expect(commands.setVisible(false)).toBe(true)
      expect(drawingRows().find((row) => row.objectId === top.objectId)?.visible).toBe(false)

      const bottom = drawingRows().find((row) => row.objectId !== top.objectId)!
      const bottomCommands = chart.objects.commandsFor(bottom.objectId)
      if (bottomCommands === null) throw new Error('drawing commands missing')
      expect(bottomCommands.move({ kind: 'pane', paneId: MAIN_PANE_ID, index: 1 })).toBe(true)
      expect(drawingIds()).toEqual(['d-a', 'd-b'])

      expect(commands.setLocked(false)).toBe(true)
      expect(commands.remove()).toBe(true)
      expect(drawingRows()).toHaveLength(1)
    } finally {
      await chart.destroy()
    }
  })

  it('行情及附属层跨 Pane、切换形态和恢复布局时保持同一个对象', async () => {
    const { chart } = mountChart()
    const layerIds = [
      'plugin:candle',
      'plugin:footprint',
      'plugin:comparisonLine',
      'plugin:lastPriceLine',
      'plugin:extremaMarkers',
    ]
    try {
      const paneId = chart.panes.addPane(MAIN_PANE_ID, 'below')!
      const commands = chart.objects.commandsFor('plugin:candle')!
      expect(commands.move({ kind: 'pane', paneId })).toBe(true)
      const primary = chart.getRenderer('plugin:candle')
      for (const id of layerIds) expect(chart.getRenderer(id)?.pane).toBe(paneId)
      expect(chart.axes.bindingFor('plugin:candle')).toMatchObject({
        paneId,
        axisId: PRICE_SERIES_AXIS_ID,
      })
      expect(chart.panes.hasPane(MAIN_PANE_ID)).toBe(false)

      commands.setVisible(false)
      for (const view of ['timeshare', 'fiveDayTimeShare', 'kline'] as const) {
        chart.kernel.actions.setDataView(view)
        expect(chart.panes.hasPane(paneId)).toBe(true)
        expect(chart.getRenderer('plugin:candle')).toBe(primary)
        const rows = chart.objects.groups
          .peek()
          .flatMap((group) => group.rows)
          .filter((row) => row.kind === 'system')
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ objectId: 'plugin:candle', paneId, visible: false })
        for (const id of layerIds) expect(chart.getRenderer(id)?.visible).toBe(false)
      }
      commands.setVisible(true)
      chart.kernel.settings.actions.patch({ klineShape: 'footprint' })
      expect(chart.getRenderer('plugin:footprint')?.visible).toBe(true)
      commands.setVisible(false)
      expect(chart.getRenderer('plugin:footprint')?.visible).toBe(false)
      const saved = chart.kernel.exportLayout()
      const otherPaneId = chart.panes.addPane(paneId, 'below')!
      commands.move({ kind: 'pane', paneId: otherPaneId })
      chart.kernel.applyLayout(saved)
      for (const id of layerIds) expect(chart.getRenderer(id)?.pane).toBe(paneId)
      expect(
        chart.objects.groups
          .peek()
          .flatMap((group) => group.rows)
          .find((row) => row.kind === 'system'),
      ).toMatchObject({ paneId, visible: false })
    } finally {
      await chart.destroy()
    }
  })

  it('drawingCommands.remove drops id from kernel and clears selection, with undo and redo', async () => {
    const { chart } = mountChart()
    try {
      chart.drawing.setDrawings([createTrendLine('d1'), createTrendLine('d2')])
      chart.drawing.setSelectedIds(['d1'])
      chart.drawingCommands.remove('d1')
      expect(chart.kernel.drawing.readonly.drawings.peek().map((drawing) => drawing.id)).toEqual([
        'd2',
      ])
      expect(chart.kernel.drawing.readonly.selectedDrawingIds.peek()).toEqual([])
      expect(chart.undoDrawing()).toBe(true)
      expect(chart.drawing.drawings.peek().map((drawing) => drawing.id)).toEqual(['d1', 'd2'])
      expect(chart.drawing.selectedIds.peek()).toEqual(['d1'])
      expect(chart.redoDrawing()).toBe(true)
      expect(chart.drawing.drawings.peek().map((drawing) => drawing.id)).toEqual(['d2'])
    } finally {
      await chart.destroy()
    }
  })

  it('projects the main series as a non-removable system object', async () => {
    const { chart, definitions } = mountChart()
    try {
      const rowsOf = () =>
        chart.objects.groups.peek().find((group) => group.paneId === MAIN_PANE_ID)?.rows ?? []
      const systemRow = () => rowsOf().find((row) => row.kind === 'system')
      const row = systemRow()
      if (row === undefined) throw new Error('system object missing')

      // 未选品种时用中性占位；有品种时读取 symbol 代码。
      expect(row.label).toBe('未选择品种')
      expect(row.capabilities).toMatchObject({
        removable: false,
        hideable: true,
        orderable: true,
        movable: true,
        lockable: false,
      })

      const commands = chart.objects.commandsFor(row.objectId)
      if (commands === null) throw new Error('system commands missing')
      expect(commands.remove()).toBe(false)
      expect(commands.setLocked(true)).toBe(false)

      expect(commands.setVisible(false)).toBe(true)
      expect(systemRow()?.visible).toBe(false)
      expect(chart.getRenderer(row.objectId)?.visible).toBe(false)
      expect(commands.setVisible(true)).toBe(true)
      expect(systemRow()?.visible).toBe(true)
      expect(chart.getRenderer(row.objectId)?.visible).toBe(true)

      // 主序列可在主图层带内调整顺序：拖到指标下方后 z 变小。
      const definitionId = 'system-order-indicator'
      registerPlotDefinition(definitions, {
        id: definitionId,
        name: definitionId,
        source: 'script',
        position: 'main',
        inputs: {},
        compute: () => ({ plots: [], fills: [] }),
      })
      const indicatorId = chart.indicators.add(definitionId)
      if (indicatorId === null) throw new Error('indicator missing')
      const layerId = indicatorLayerId(definitions, definitionId, MAIN_PANE_ID, indicatorId)
      expect(chart.getRenderer(row.objectId)!.z).toBeGreaterThan(
        chart.getRenderer(layerId)!.z,
      )
      expect(commands.move({ kind: 'pane', paneId: MAIN_PANE_ID, index: 0 })).toBe(true)
      expect(chart.getRenderer(row.objectId)!.z).toBeLessThan(
        chart.getRenderer(layerId)!.z,
      )
    } finally {
      await chart.destroy()
    }
  })
})
