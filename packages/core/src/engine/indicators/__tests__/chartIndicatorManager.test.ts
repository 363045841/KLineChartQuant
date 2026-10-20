/**
 * ChartIndicatorManager 测试：实例 CRUD、主图增删改、副图 pane 联动、读者寻址与主图价格范围。
 */

import type { IndicatorDefinition } from '@363045841yyt/klinechart-plot-contracts'
import { createDrawingObject, ShapeSize } from '@363045841yyt/klinechart-plot-contracts'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlotCollection, PlotRenderState } from '@/engine/plots/types.js'
import { createPluginHost } from '@/foundation/plugin'
import { makePluginLayerId } from '@/foundation/plugin/impl/rendererLayerId.js'
import { createSignal } from '@/foundation/reactivity/signal'
import { DEFAULT_DRAWING_STROKE, resolveThemeColors } from '@/foundation/tokens/index.js'
import type { KLineData } from '@/foundation/types/price.js'
import { createRendererLayerStore } from '../../__tests__/helpers/rendererLayerStoreTestKit'
import {
  createContextWithInstanceState,
  createMockCanvasContext,
} from '../../__tests__/helpers/renderTestKit'
import type { PaneSpec } from '../../pane/types'
import { plotRenderer } from '../../plots/impl/plotDefinition.js'
import { paintPlots } from '../../plots/impl/plotRenderer.js'
import { createIndicatorState } from '../../state/indicatorState'
import { ChartIndicatorManager, type IndicatorDependencies } from '../chartIndicatorManager'
import { Indicator } from '../indicatorDecorator.js'
import {
  getRegisteredIndicatorDefinition,
  registerIndicatorDefinition,
} from '../indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../indicatorMetadata.js'
import type { IndicatorParameters } from '../instances/domain/instanceModel.js'
import { loadBuiltinIndicators } from '../registerBuiltins'
import { registerPlotIndicator, updatePlotIndicator } from '../registerPlotIndicator.js'
import { createTestData } from './helpers/instanceTestKit'

/**
 * 用引擎自身能力注册一个产出 Plot 的外部指标，等价于脚本适配层做的事：
 * 外部来源只提供 Plot 数据，渲染交给引擎。
 */
function registerExternalPlotIndicator(config: {
  name: string
  category: 'main' | 'sub'
  compute: (data: KLineData[], params: IndicatorParameters) => PlotCollection
}): void {
  const paneId = config.category === 'main' ? 'main' : `sub_${config.name}`
  const decorate = Indicator({
    name: config.name,
    displayName: config.name,
    kind: IndicatorKind.Indicator,
    category: config.category,
    defaultPaneId: paneId,
    allowMainPane: config.category === 'main',
    mainPane:
      config.category === 'main'
        ? { toActiveConfig: (params, active) => (active ? params : null) }
        : undefined,
    plots: { source: 'collection', series: [] },
    runtime: { defaultParams: { factor: 1 }, compute: config.compute },
  })
  class ExternalPlotDefinition {
    static rendererFactory = plotRenderer(config.name)
  }
  decorate(ExternalPlotDefinition)
  registerIndicatorDefinition(ExternalPlotDefinition)
}

/** 读取数字参数；缺省或类型不符时回落到 1。 */
function numberOf(params: IndicatorParameters, key: string): number {
  const value = params[key]
  return typeof value === 'number' ? value : 1
}

beforeAll(async () => {
  await loadBuiltinIndicators()
  registerExternalPlotIndicator({
    name: 'PlotClose',
    category: 'main',
    compute: (data, params) => ({
      plots: [
        {
          kind: 'line',
          id: 'close',
          label: 'CLOSE',
          data: data.map((bar) => ({ value: bar.close * numberOf(params, 'factor') })),
          color: 'red',
          visible: true,
          offset: 0,
          size: ShapeSize.Auto,
          dash: [],
        },
      ],
      fills: [],
    }),
  })
  registerExternalPlotIndicator({
    name: 'PlotVolume',
    category: 'sub',
    compute: (data) => ({
      plots: [
        {
          kind: 'columns',
          id: 'volume',
          label: 'VOLUME',
          data: data.map((bar) => ({ value: bar.volume ?? 0 })),
          color: 'blue',
          visible: true,
          offset: 0,
          size: ShapeSize.Auto,
          baseline: 0,
        },
      ],
      fills: [],
    }),
  })
})

/** 构造满足 IndicatorDependencies 的最小依赖，并暴露可断言的 renderer 记录。 */
function createMockDeps() {
  const rendererLayers = createRendererLayerStore()
  const paneRatios$ = createSignal<Readonly<Record<string, number>>>({})
  const paneSpecs$ = createSignal<ReadonlyArray<PaneSpec>>([])
  const indicator = createIndicatorState()
  const subPaneOps: IndicatorDependencies['subPaneOps'] = {
    create: (entry) => indicator.actions.upsertSub(entry),
    remove: (paneId) => indicator.actions.removeSub(paneId),
    replace: (paneId, indicatorId, params) =>
      indicator.actions.replaceSub({ paneId, indicatorId, params }),
    setParams: (paneId, params) => indicator.actions.setSubParams(paneId, params),
    clear: () => indicator.actions.clearSub(),
  }

  const deps = {
    plotColors$: createSignal(resolveThemeColors('light', false)),
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
    getRenderer: rendererLayers.getRenderer,
    useRenderer: rendererLayers.useRenderer,
    removeRenderer: rendererLayers.removeRenderer,
    getVisibleMainIndicatorIds: () => [] as ReadonlyArray<string>,
    paneRatios$,
    paneSpecs$,
    projectPaneLayout: vi.fn(),
    getLastVisibleRange: () => ({ start: 0, end: 0 }),
    getCrosshairPos: () => null,
    getCrosshairPrice: () => null,
    getActivePaneId: () => null,
    scheduleDraw: vi.fn(),
    getLayer: rendererLayers.getLayer,
    indicator,
    subPaneOps,
    runRendererTransaction: (run: () => void) => run(),
  } satisfies IndicatorDependencies

  return { deps, useRenderer: rendererLayers.useRenderer, indicator }
}

describe('ChartIndicatorManager', () => {
  it.each(['main', 'sub'])('异步重算期间 %s 指标始终按原始时间身份对齐，连续补历史不累计错位', async (category) => {
    const name = `Timeline_${category}`
    registerExternalPlotIndicator({ name, category: category === 'main' ? 'main' : 'sub', compute: (data) => ({
      plots: [{ kind: 'line', id: 'close', label: 'Close', color: DEFAULT_DRAWING_STROKE,
        visible: true, offset: 0, size: ShapeSize.Auto, dash: [], data: data.map((bar) => ({ value: bar.close })) }],
      fills: [],
      drawings: [createDrawingObject({ id: 'line', kind: 'trend-line', paneId: 'main', xloc: 'bar_index',
        anchors: [{ id: 'a', logicalIndex: 0, price: data[0]!.close }, { id: 'b', logicalIndex: data.length, price: data[0]!.close }],
      }, DEFAULT_DRAWING_STROKE)],
    }) })
    manager.addIndicator(name)
    const id = harness.indicator.readonly.instances.peek().find((instance) => instance.indicatorId === name)!.instanceId
    const all = createTestData(8)
    const initial = all.slice(4, 7)
    const reader = manager.createRenderStateReader()
    /** 从同一读取器观察同步展示更新与异步提交之间的窗口。 */
    const read = (): PlotRenderState => reader.get<PlotRenderState>(id)!
    manager.updateIndicatorData(initial, { start: 0, end: 3 })
    await vi.waitFor(() => expect(read()?.plots[0]?.data).toHaveLength(3))
    const original = read()
    manager.updateIndicatorData(all.slice(2, 7), { start: 0, end: 5 })
    expect(read().plots[0]?.data).toEqual([undefined, undefined, ...original.plots[0]!.data])
    expect(read().drawings?.[0]?.anchors.map((anchor) => anchor.logicalIndex)).toEqual([2, 5])
    manager.updateIndicatorData(all, { start: 0, end: 8 })
    expect(read().plots[0]?.data).toEqual([undefined, undefined, undefined, undefined, ...original.plots[0]!.data, undefined])
    expect(read().drawings?.[0]?.anchors.map((anchor) => anchor.logicalIndex)).toEqual([4, 7])
    // 原始计算输出没有被投影反向修改，新结果提交后才填充新位置。
    expect(original.drawings?.[0]?.anchors.map((anchor) => anchor.logicalIndex)).toEqual([0, 3])
    await vi.waitFor(() => expect(read().plots[0]?.data[0]).toMatchObject({ value: all[0]!.close }))
    expect(read().plots[0]?.data).toEqual(all.map((bar) => ({ value: bar.close })))
    expect(read().drawings?.[0]?.anchors.map((anchor) => anchor.logicalIndex)).toEqual([0, 8])
  })

  it('分时展示重排 Plot 数据时保留图元列表、锚点和线型数组', async () => {
    manager.enableMainIndicator('PlotClose')
    const data = createTestData(3)
    const display = [data[1]!.timestamp, data[2]!.timestamp]
    manager.updateIndicatorData(data, { start: 0, end: 2 }, 1, display)
    const reader = manager.createRenderStateReader()
    await vi.waitFor(() => expect(reader.get<PlotRenderState>('main:PlotClose')?.plots[0]?.data).toEqual([
      { value: data[1]!.close, color: undefined }, { value: data[2]!.close, color: undefined },
    ]))
  })
  it.each(['main', 'sub'])('按 %s 指标身份统一隐藏与恢复 Plot 和 drawing，保留计算结果', async (category) => {
    const name = `Visibility_${category}`
    const compute = vi.fn((data: KLineData[]): PlotCollection => ({
      plots: [{
        kind: 'line', id: 'close', label: 'Close', color: DEFAULT_DRAWING_STROKE,
        visible: true, offset: 0, size: ShapeSize.Auto, dash: [],
        data: data.map((bar) => ({ value: bar.close })),
      }],
      fills: [],
      drawings: [createDrawingObject({
        id: 'line', kind: 'trend-line', paneId: 'main', xloc: 'bar_index',
        anchors: [{ id: 'a', logicalIndex: 0, price: 100 }, { id: 'b', logicalIndex: 1, price: 200 }],
      }, DEFAULT_DRAWING_STROKE)],
    }))
    registerExternalPlotIndicator({ name, category: category === 'main' ? 'main' : 'sub', compute })
    expect(manager.addIndicator(name)).not.toBeNull()
    const id = harness.indicator.readonly.instances.peek().find((instance) => instance.indicatorId === name)!.instanceId
    manager.updateIndicatorData(createTestData(5), { start: 0, end: 5 })
    const reader = manager.createRenderStateReader()
    await vi.waitFor(() => expect(reader.get<PlotRenderState>(id)?.drawings).toHaveLength(1))
    const output = reader.get<PlotRenderState>(id)!
    expect(output.plots).toHaveLength(1)
    const snapshot = manager.getRenderStatesSnapshot()
    expect(manager.getRenderStatesSnapshot()).toBe(snapshot)
    const calls = compute.mock.calls.length
    /** 使用正式主图与副图隐藏入口，验证已有读取器同步反映实例展示状态。 */
    const setHidden = (hidden: boolean): void => {
      if (category === 'main') manager.setMainHidden(name, hidden)
      else manager.setSubHidden(manager.getSubPaneEntries().find((pane) => pane.instanceId === id)!.paneId, hidden)
    }
    setHidden(true)
    expect(reader.get(id)).toBeUndefined()
    expect(manager.getRenderStatesSnapshot().has(id)).toBe(false)
    expect(manager.getRenderStatesSnapshot()).not.toBe(snapshot)
    if (category === 'main') expect(manager.getMainIndicatorPriceRange()).toBeNull()
    setHidden(false)
    expect(reader.get(id)).toBe(output)
    expect(manager.getRenderStatesSnapshot().get(id)).toBe(output)
    expect(compute).toHaveBeenCalledTimes(calls)
  })
  it('外部 Plot 副图使用柱形模型及零基准范围', async () => {
    const instance = manager.addIndicator('PlotVolume')
    expect(instance).not.toBeNull()
    const data = createTestData(5)
    manager.updateIndicatorData(data, { start: 0, end: 5 })
    await vi.waitFor(() => expect(manager.createRenderStateReader().get(instance!)).toBeDefined())
    const state = manager.createRenderStateReader().get<PlotRenderState>(instance!)!
    expect(state.plots[0]).toMatchObject({ kind: 'columns', baseline: 0 })
    expect(state.visibleMin).toBe(0)
    expect(state.plots[0]?.data[0]).toMatchObject({ value: data[0]?.volume })
  })
  it('副图脚本改名后保留实例、窗格和参数，并用新实现立即重算', async () => {
    /** 测试脚本产物使用正式中立 Plot 注册入口。 */
    const definition = (factor: number): IndicatorDefinition<Record<string, never>> => ({
      id: 'script_editable_plot',
      name: `EditablePlotScript ${factor}`,
      source: 'script',
      inputs: {},
      compute: (bars: readonly { close: number }[]): PlotCollection => ({
        plots: [
          {
            kind: 'line',
            id: 'close',
            label: 'close',
            color: 'red',
            visible: true,
            offset: 0,
            size: ShapeSize.Auto,
            dash: [],
            data: bars.map((bar) => ({ value: bar.close * factor })),
          },
        ],
        fills: [],
      }),
    })
    registerPlotIndicator(definition(1))
    const id = manager.addIndicator('script_editable_plot', { period: 7 })
    expect(id).not.toBeNull()
    const pane = manager.getSubPaneEntries()[0]!
    const data = createTestData(3)
    manager.updateIndicatorData(data, { start: 0, end: 3 })
    const read = () => manager.createRenderStateReader().get<PlotRenderState>(id ?? '')
    await vi.waitFor(() =>
      expect(read()?.plots[0]?.data[0]).toMatchObject({ value: data[0]?.close }),
    )
    expect(() => updatePlotIndicator(definition(2))).not.toThrow()
    await vi.waitFor(() =>
      expect(read()?.plots[0]?.data[0]).toMatchObject({ value: (data[0]?.close ?? 0) * 2 }),
    )
    updatePlotIndicator(definition(3))
    await vi.waitFor(() =>
      expect(read()?.plots[0]?.data[0]).toMatchObject({ value: (data[0]?.close ?? 0) * 3 }),
    )
    expect(manager.getSubPaneEntries()).toHaveLength(1)
    expect(manager.getSubPaneEntries()[0]).toMatchObject({
      instanceId: id,
      paneId: pane.paneId,
      indicatorId: 'script_editable_plot',
      params: { period: 7 },
    })
    // 位置由定义派生，迁移到主图后必须继续按原实例身份读取计算结果。
    updatePlotIndicator({ ...definition(3), position: 'main' })
    expect(manager.getSubPaneEntries()).toHaveLength(0)
    const metadata = getRegisteredIndicatorDefinition('script_editable_plot')!
    const renderer = deps.getRenderer(
      makePluginLayerId(
        metadata.getRendererName({ paneId: 'main', indicatorId: 'script_editable_plot' }),
      ),
    )!
    const ctx = createMockCanvasContext()
    renderer.paint(
      createContextWithInstanceState(ctx, id!, read()!, {
        range: { start: 0, end: 3 },
      }),
    )
    expect(ctx.stroke).toHaveBeenCalled()
    manager.updateMainIndicatorParams('script_editable_plot', { period: 9 })
    manager.setActiveMainIndicators(['script_editable_plot'])
    expect(manager.indicatorsComputed()[0]?.id).toBe(id)
  })
  it('主图脚本改名后保留已启用实例与参数，并刷新实例标签', () => {
    /** 宿主为脚本分配稳定 ID；展示名由脚本源码声明并可编辑。 */
    const scriptId = 'script_rename_fixture'
    const source = (displayName: string): IndicatorDefinition<Record<string, never>> => ({
      id: scriptId,
      name: displayName,
      position: 'main',
      source: 'script',
      inputs: {},
      compute: () => ({ plots: [], fills: [] }),
    })

    registerPlotIndicator(source('Old Script Name'))
    expect(manager.addIndicator(scriptId, { factor: 3 })).toBe(scriptId)

    updatePlotIndicator(source('New Script Name'))

    // 改名不重建实例，已启用状态与参数保留。
    expect(manager.isMainIndicatorActive(scriptId)).toBe(true)
    expect(manager.getMainIndicatorParams(scriptId)).toEqual({ factor: 3 })
    // 实例的规范 ID 不变，展示标签随展示名刷新。
    const instance = manager.indicatorsComputed().find((entry) => entry.definitionId === scriptId)
    expect(instance?.definitionId).toBe(scriptId)
    expect(instance?.label).toBe('New Script Name')
  })
  it('外部 Plot 实例计算后使用通用 Plot 绘制，参数和行情更新不残留旧点', async () => {
    manager.enableMainIndicator('PlotClose')
    const data = createTestData(5)
    manager.updateIndicatorData(data, { start: 0, end: 5 })
    const read = () => manager.createRenderStateReader().get<PlotRenderState>('main:PlotClose')
    await vi.waitFor(() => expect(read()?.plots[0]?.data.length).toBe(5))
    const state = read()!
    expect(state.plots[0]?.data[0]).toMatchObject({ value: data[0]?.close })
    const ctx = createMockCanvasContext()
    paintPlots(
      state,
      createContextWithInstanceState(ctx, 'main:PlotClose', state, {
        range: { start: 0, end: 5 },
      }),
    )
    expect(ctx.stroke).toHaveBeenCalled()
    manager.updateMainIndicatorParams('PlotClose', { factor: 2 })
    await vi.waitFor(() =>
      expect(read()?.plots[0]?.data[0]).toMatchObject({ value: data[0]!.close * 2 }),
    )
    manager.updateIndicatorData(data.slice(0, 3), { start: 0, end: 3 })
    await vi.waitFor(() => expect(read()?.plots[0]?.data.length).toBe(3))
    manager.disableMainIndicator('PlotClose')
    expect(read()).toBeUndefined()
  })
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

  describe('副图实例 CRUD', () => {
    it('为副图指标生成独立实例身份并支持增改删', () => {
      const instanceId = manager.addIndicator('PlotVolume')
      expect(instanceId).not.toBeNull()

      const entry = manager.getSubPaneEntries()[0]!
      expect(entry.instanceId).toBe(instanceId)
      expect(entry.instanceId).not.toBe(entry.paneId)
      expect(entry.indicatorId).toBe('PlotVolume')
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

  describe('隐藏指标', () => {
    it('隐藏副图指标只保留 pane 与实例，不删除副图', () => {
      const instanceId = manager.addIndicator('PlotVolume')
      expect(instanceId).not.toBeNull()
      const paneId = manager.getSubPaneEntries()[0]!.paneId

      expect(manager.setSubHidden(paneId, true)).toBe(true)
      expect(harness.indicator.readonly.instances.peek()).toEqual([
        expect.objectContaining({ instanceId, paneId, hidden: true }),
      ])
      expect(manager.getSubPaneEntries()).toHaveLength(1)
    })
  })
})
