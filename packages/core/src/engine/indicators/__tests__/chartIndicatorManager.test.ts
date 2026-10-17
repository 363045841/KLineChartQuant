/**
 * ChartIndicatorManager 测试：实例 CRUD、主图增删改、副图 pane 联动、读者寻址与主图价格范围。
 */

import type { IndicatorDefinition } from '@363045841yyt/klinechart-plot-contracts'
import { ShapeSize } from '@363045841yyt/klinechart-plot-contracts'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlotCollection, PlotRenderState } from '@/engine/plots/types.js'
import { createPluginHost } from '@/foundation/plugin'
import { makePluginLayerId } from '@/foundation/plugin/impl/rendererLayerId.js'
import { createSignal } from '@/foundation/reactivity/signal'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import type { KLineData } from '@/foundation/types/price.js'
import type { FootprintRenderState } from '../../../components/footprint/types'
import { createTradeBuffer } from '../../../data/trades/impl/tradeBuffer'
import { createRendererLayerStore } from '../../__tests__/helpers/rendererLayerStoreTestKit'
import {
  createContextWithInstanceState,
  createKLineData,
  createMockCanvasContext,
} from '../../__tests__/helpers/renderTestKit'
import type { PaneSpec } from '../../pane/types'
import { plotRenderer } from '../../plots/impl/plotDefinition.js'
import { paintPlots } from '../../plots/impl/plotRenderer.js'
import { createIndicatorState } from '../../state/indicatorState'
import { ChartIndicatorManager, type IndicatorDependencies } from '../chartIndicatorManager'
import { Indicator } from '../indicatorDecorator.js'
import {
  getIndicatorDescriptor,
  getRegisteredIndicatorDefinition,
  getRegisteredIndicatorDefinitions,
  registerIndicatorDefinition,
} from '../indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../indicatorMetadata.js'
import { createInstanceCalculationDefinitions } from '../instances/assembly/instanceDefinitionCatalog.js'
import type { IndicatorParameters } from '../instances/domain/instanceModel.js'
import { IndicatorInstanceExecutionRuntime } from '../instances/execution/instanceExecutionRuntime.js'
import type { InstanceWorkerRequest } from '../instances/worker/instanceWorkerProtocol.js'
import { loadBuiltinIndicators } from '../registerBuiltins'
import { registerPlotIndicator, updatePlotIndicator } from '../registerPlotIndicator.js'
import type { VolumeRenderState } from '../stateComposer'
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
  it('Worker 可用时，外部 Plot 指标和内置指标分别执行并统一提交', async () => {
    const requests: InstanceWorkerRequest[] = []
    class TestWorker {
      onmessage: ((event: { data: unknown }) => void) | null = null
      onerror = null
      private runtime = new IndicatorInstanceExecutionRuntime(
        createInstanceCalculationDefinitions(getRegisteredIndicatorDefinitions()),
      )
      postMessage(message: InstanceWorkerRequest) {
        requests.push(message)
        if (message.type === 'init')
          queueMicrotask(() =>
            this.onmessage?.({ data: { type: 'ready', protocolVersion: message.protocolVersion } }),
          )
        if (message.type === 'setData') this.runtime.setData(message.data, message.dataRevision)
        if (message.type === 'execute') {
          const outputs = this.runtime.execute(message.plan)
          queueMicrotask(() =>
            this.onmessage?.({
              data: {
                type: 'result',
                requestId: message.requestId,
                dataRevision: message.dataRevision,
                calculationRevision: message.plan.calculationRevision,
                outputs,
                metrics: { computeMs: 0, taskCount: outputs.length },
              },
            }),
          )
        }
      }
      terminate() {}
    }
    manager.destroy()
    vi.stubGlobal('Worker', TestWorker)
    try {
      manager = new ChartIndicatorManager(deps)
      manager.start()
      manager.enableMainIndicator('PlotClose')
      manager.enableMainIndicator('ENE')
      manager.updateIndicatorData(createTestData(30), { start: 20, end: 30 })
      await vi.waitFor(() => {
        expect(manager.createRenderStateReader().get('main:PlotClose')).toBeDefined()
        expect(manager.createRenderStateReader().get('main:ENE')).toBeDefined()
      })
      const executions = requests.filter((request) => request.type === 'execute')
      expect(executions.length).toBeGreaterThan(0)
      expect(
        executions.flatMap((request) => request.plan.tasks.map((task) => task.definitionId)),
      ).toContain('ene')
      expect(
        executions.flatMap((request) => request.plan.tasks.map((task) => task.definitionId)),
      ).not.toContain('PlotClose')
    } finally {
      manager.destroy()
      vi.unstubAllGlobals()
    }
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
    expect(state.plots[0]?.data[0]?.value).toBe(data[0]?.volume)
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
    await vi.waitFor(() => expect(read()?.plots[0]?.data[0]?.value).toBe(data[0]?.close))
    expect(() => updatePlotIndicator(definition(2))).not.toThrow()
    await vi.waitFor(() => expect(read()?.plots[0]?.data[0]?.value).toBe((data[0]?.close ?? 0) * 2))
    updatePlotIndicator(definition(3))
    await vi.waitFor(() => expect(read()?.plots[0]?.data[0]?.value).toBe((data[0]?.close ?? 0) * 3))
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
    expect(state.plots[0]?.data[0]?.value).toBe(data[0]?.close)
    const ctx = createMockCanvasContext()
    paintPlots(
      state,
      createContextWithInstanceState(ctx, 'main:PlotClose', state, {
        range: { start: 0, end: 5 },
      }),
    )
    expect(ctx.stroke).toHaveBeenCalled()
    manager.updateMainIndicatorParams('PlotClose', { factor: 2 })
    await vi.waitFor(() => expect(read()?.plots[0]?.data[0]?.value).toBe(data[0]!.close * 2))
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

  it('启用足迹时挂载绘制层，并将历史成交结果绘制到覆盖画布', async () => {
    const data = createKLineData(100)
    manager.enableMainIndicator('Footprint')
    const layer = deps.getLayer(makePluginLayerId('footprint'))
    expect(layer).not.toBeNull()
    expect(layer?.role).toBe('overlay')
    manager.updateIndicatorData(data, { start: 80, end: 82 }, 1)
    const buffer = createTradeBuffer({
      id: 'binance:spot:BTCUSDT',
      sourceId: 'binance',
      symbol: 'BTCUSDT',
      name: 'BTCUSDT',
      exchange: 'BINANCE',
      assetClass: 'crypto',
      tickSize: 0.01,
      capabilities: { trades: { raw: true, live: true } },
    })
    const unsubscribe = buffer.snapshot.subscribe(() =>
      manager.updateTradeInput({ ...buffer.snapshot.peek(), status: 'ready', message: null }),
    )
    try {
      buffer
        .prepareHistory({
          complete: true,
          range: { from: data[81]!.timestamp, to: data[82]!.timestamp },
          items: [
            {
              tradeId: '1',
              timestamp: data[81]!.timestamp,
              price: '100',
              size: '0.25',
              side: 'sell',
            },
          ],
        })
        .commit()
      const instanceId = harness.indicator.readonly.instances
        .peek()
        .find((instance) => instance.indicatorId === 'Footprint')!.instanceId
      await vi.waitFor(() => {
        const state = manager.createRenderStateReader().get<FootprintRenderState>(instanceId)
        expect(state?.series.bars[81]?.total).toBe('25')
      })
      const ctx = createMockCanvasContext()
      layer?.paint(
        createContextWithInstanceState(
          ctx,
          instanceId,
          manager.createRenderStateReader().get(instanceId),
          {
            overlayCtx: ctx,
            range: { start: 81, end: 82 },
            kLineCenters: [200],
            kWidth: 60,
            kGap: 4,
            pane: { height: 500, yAxis: { priceToY: (price) => 500 - price } },
          },
        ),
      )
      expect(ctx.fillRect).toHaveBeenCalled()
      expect(deps.scheduleDraw).toHaveBeenCalled()
    } finally {
      unsubscribe()
      buffer.dispose()
    }
  })

  describe('main indicator params', () => {
    it('更新主图参数时以合并后的完整参数写回状态并重建 Layer', () => {
      manager.enableMainIndicator('MA')

      manager.updateMainIndicatorParams('MA', { ma5: false })

      expect(manager.getMainIndicatorParams('MA')).toEqual({
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
    it('移动 Legend 保留实例及参数，并在没有计算变更时请求重绘', () => {
      manager.enableMainIndicator('MA', { ma5: false })
      manager.enableMainIndicator('ENE')
      const before = harness.indicator.readonly.instances.peek()
      vi.clearAllMocks()

      expect(manager.moveMainIndicator('ENE', 'up')).toBe(true)
      expect(harness.indicator.readonly.instances.peek()).toEqual([before[1], before[0]])
      expect(deps.scheduleDraw).toHaveBeenCalledTimes(1)
      expect(manager.moveMainIndicator('ENE', 'up')).toBe(false)
      expect(manager.moveMainIndicator('missing', 'down')).toBe(false)
    })

    it('替换主图 Legend 保留位置及其余实例，拒绝副图定义和重复指标', () => {
      manager.enableMainIndicator('MA', { ma5: false })
      manager.enableMainIndicator('ENE')
      const first = harness.indicator.readonly.instances.peek()[0]
      expect(manager.replaceMainIndicator('ENE', 'MA')).toBe(false)
      expect(manager.replaceMainIndicator('ENE', 'CCI')).toBe(false)
      expect(manager.replaceMainIndicator('ENE', 'EXPMA')).toBe(true)
      expect(manager.getActiveMainIndicators()).toEqual(['MA', 'EXPMA'])
      expect(harness.indicator.readonly.instances.peek()[0]).toEqual(first)
      expect(manager.getMainIndicatorParams('EXPMA')).not.toBeNull()
    })

    it('重复启用只注册一次 renderer 资源', () => {
      expect(manager.enableMainIndicator('MA')).toBe(true)
      expect(manager.enableMainIndicator('MA')).toBe(true)

      expect(harness.useRenderer).toHaveBeenCalledTimes(1)
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
      const instanceId = manager.addIndicator('VOL')
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

  describe('隐藏指标', () => {
    it('隐藏主图指标卸载绘制 Layer，但保留实例、参数与显示能力', () => {
      manager.enableMainIndicator('MA', { ma5: false })
      vi.clearAllMocks()

      expect(manager.setMainHidden('MA', true)).toBe(true)
      expect(deps.removeRenderer).toHaveBeenCalledTimes(1)
      expect(manager.isMainIndicatorActive('MA')).toBe(true)
      expect(harness.indicator.readonly.instances.peek()[0]).toEqual(
        expect.objectContaining({ instanceId: 'main:MA', hidden: true }),
      )

      vi.clearAllMocks()
      expect(manager.setMainHidden('MA', false)).toBe(true)
      expect(harness.useRenderer).toHaveBeenCalled()
      expect(harness.indicator.readonly.instances.peek()[0]).not.toHaveProperty('hidden')
      expect(manager.getMainIndicatorParams('MA')?.ma5).toBe(false)
    })

    it('隐藏副图指标只保留 pane 与实例，不删除副图', () => {
      const instanceId = manager.addIndicator('VOL')
      expect(instanceId).not.toBeNull()
      const paneId = manager.getSubPaneEntries()[0]!.paneId

      expect(manager.setSubHidden(paneId, true)).toBe(true)
      expect(harness.indicator.readonly.instances.peek()).toEqual([
        expect.objectContaining({ instanceId, paneId, hidden: true }),
      ])
      expect(manager.getSubPaneEntries()).toHaveLength(1)
    })

    it('未启用的指标隐藏返回 false', () => {
      expect(manager.setMainHidden('MA', true)).toBe(false)
      expect(manager.setSubHidden('missing', true)).toBe(false)
    })
  })

  describe('实例结果投影', () => {
    it.each([false, true])('VOL 使用分时帧行情，已有 K 线计算结果：%s', async (hasResults) => {
      const instanceId = manager.addIndicator('VOL')!
      const otherId = manager.addIndicator('OBV')!
      if (hasResults) {
        manager.enableMainIndicator('MA')
        const calculationData = createTestData(80)
        manager.updateIndicatorData(calculationData, { start: 0, end: 80 })
        await vi.waitFor(() => {
          expect(manager.createRenderStateReader().get('main:MA')).toBeDefined()
        })
      }
      const data = [
        { timestamp: 1, price: 10, average: 10, volume: 100 },
        { timestamp: 2, price: 11, average: 10.5, volume: 200 },
      ]
      const reader = manager.createRenderStateReader({ data, range: { start: 0, end: 2 } })
      expect(reader.get<VolumeRenderState>(instanceId)).toEqual({
        timestamp: expect.any(Number),
        valueMin: 90,
        valueMax: 210,
      })
      expect(reader.get<VolumeRenderState>(otherId)).not.toEqual(reader.get(instanceId))
      expect(
        manager.createRenderStateReader({ data: [], range: { start: 0, end: 0 } }).get(instanceId),
      ).toBeUndefined()
    })

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
      manager.enableMainIndicator('KELTNER')
      const data = createTestData(80)

      manager.updateIndicatorData(data, { start: 0, end: data.length })

      await vi.waitFor(() => {
        expect(manager.createRenderStateReader().get('main:Keltner')).toBeDefined()
      })
      const state = manager.createRenderStateReader().get<{
        params: Record<string, unknown>
        visibleMin: number
        visibleMax: number
      }>('main:Keltner')!

      expect(state.params.emaPeriod).toBe(20)
      expect(state.params.multiplier).toBe(2)
      expect(state.params.showUpper).toBe(true)
      expect(state.params.showMiddle).toBe(true)
      expect(state.params.showLower).toBe(true)
      expect(state.visibleMin).toBeLessThan(state.visibleMax)
    })

    it('展示配置变化只重建投影', async () => {
      manager.enableMainIndicator('KELTNER')
      const data = createTestData(80)
      manager.updateIndicatorData(data, { start: 0, end: data.length })
      await vi.waitFor(() => {
        expect(manager.createRenderStateReader().get('main:Keltner')).toBeDefined()
      })

      manager.updateMainIndicatorParams('KELTNER', { showUpper: false })

      const state = manager.createRenderStateReader().get<{
        params: Record<string, unknown>
      }>('main:Keltner')!
      expect(state.params.showUpper).toBe(false)
      expect(state.params.showMiddle).toBe(true)
      expect(state.params.showLower).toBe(true)
    })
  })

  describe('生命周期', () => {
    it('滚动只更新 Plot 范围，主题变化只重建绘图投影', async () => {
      manager.enableMainIndicator('ENE')
      const data = createTestData(80)
      manager.updateIndicatorData(data, { start: 20, end: 40 })
      await vi.waitFor(() =>
        expect(manager.createRenderStateReader().get('main:ENE')).toBeDefined(),
      )
      const initial = manager.createRenderStateReader().get<PlotRenderState>('main:ENE')!
      manager.updateVisibleRangeForFrame({ start: 40, end: 60 })
      const scrolled = manager.createRenderStateReader().get<PlotRenderState>('main:ENE')!
      expect(scrolled.plots).toBe(initial.plots)
      expect(scrolled.visibleMin).not.toBe(initial.visibleMin)
      const dark = resolveThemeColors('dark', false)
      harness.deps.plotColors$.set(dark)
      const themed = manager.createRenderStateReader().get<PlotRenderState>('main:ENE')!
      expect(themed.plots[0]?.color).toBe(dark.ene.upper)
      expect(themed.visibleMin).toBe(scrolled.visibleMin)
    })

    it('销毁后停止状态投影', () => {
      manager.destroy()
      vi.clearAllMocks()

      harness.indicator.actions.upsertMain('MA', { ma5: true })

      expect(harness.useRenderer).not.toHaveBeenCalled()
      expect(deps.scheduleDraw).not.toHaveBeenCalled()
    })
  })
})
