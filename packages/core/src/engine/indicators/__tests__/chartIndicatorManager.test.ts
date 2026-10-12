/**
 * ChartIndicatorManager 测试：实例 CRUD、主图增删改、副图 pane 联动、读者寻址与主图价格范围。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlotCollection, PlotRenderState } from '@/engine/plots/types.js'
import { createPluginHost } from '@/foundation/plugin'
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
  getRegisteredIndicatorDefinitions,
  registerIndicatorDefinition,
} from '../indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../indicatorMetadata.js'
import { createInstanceCalculationDefinitions } from '../instances/assembly/instanceDefinitionCatalog.js'
import type { IndicatorParameters } from '../instances/domain/instanceModel.js'
import { IndicatorInstanceExecutionRuntime } from '../instances/execution/instanceExecutionRuntime.js'
import type { InstanceWorkerRequest } from '../instances/worker/instanceWorkerProtocol.js'
import { loadBuiltinIndicators } from '../registerBuiltins'
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
    indicatorType: 'other',
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
    static rendererFactory = plotRenderer(config.name, paneId)
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
          width: 1,
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
          kind: 'histogram',
          id: 'volume',
          label: 'VOLUME',
          data: data.map((bar) => ({ value: bar.volume ?? 0 })),
          color: 'blue',
          visible: true,
          offset: 0,
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
      manager.enableMainIndicator('BOLL')
      manager.updateIndicatorData(createTestData(30), { start: 20, end: 30 })
      await vi.waitFor(() => {
        expect(manager.createRenderStateReader().get('main:PlotClose')).toBeDefined()
        expect(manager.createRenderStateReader().get('main:BOLL')).toBeDefined()
      })
      const executions = requests.filter((request) => request.type === 'execute')
      expect(executions.length).toBeGreaterThan(0)
      expect(
        executions.flatMap((request) => request.plan.tasks.map((task) => task.definitionId)),
      ).toContain('boll')
      expect(
        executions.flatMap((request) => request.plan.tasks.map((task) => task.definitionId)),
      ).not.toContain('PlotClose')
    } finally {
      manager.destroy()
      vi.unstubAllGlobals()
    }
  })
  it('外部 Plot 副图使用柱状模型及零基准范围', async () => {
    const instance = manager.addIndicator('PlotVolume')
    expect(instance).not.toBeNull()
    const data = createTestData(5)
    manager.updateIndicatorData(data, { start: 0, end: 5 })
    await vi.waitFor(() => expect(manager.createRenderStateReader().get(instance!)).toBeDefined())
    const state = manager.createRenderStateReader().get<PlotRenderState>(instance!)!
    expect(state.plots[0]).toMatchObject({ kind: 'histogram', baseline: 0 })
    expect(state.visibleMin).toBe(0)
    expect(state.plots[0]?.data[0]?.value).toBe(data[0]?.volume)
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

  it('历史页写入后提交足迹结果并请求绘制', async () => {
    const data = createKLineData(100)
    manager.enableMainIndicator('Footprint')
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
      manager.enableMainIndicator('BOLL')
      const before = harness.indicator.readonly.instances.peek()
      vi.clearAllMocks()

      expect(manager.moveMainIndicator('BOLL', 'up')).toBe(true)
      expect(harness.indicator.readonly.instances.peek()).toEqual([before[1], before[0]])
      expect(deps.scheduleDraw).toHaveBeenCalledTimes(1)
      expect(manager.moveMainIndicator('BOLL', 'up')).toBe(false)
      expect(manager.moveMainIndicator('missing', 'down')).toBe(false)
    })

    it('替换主图 Legend 保留位置及其余实例，拒绝副图定义和重复指标', () => {
      manager.enableMainIndicator('MA', { ma5: false })
      manager.enableMainIndicator('BOLL')
      const first = harness.indicator.readonly.instances.peek()[0]
      expect(manager.replaceMainIndicator('BOLL', 'MA')).toBe(false)
      expect(manager.replaceMainIndicator('BOLL', 'RSI')).toBe(false)
      expect(manager.replaceMainIndicator('BOLL', 'EXPMA')).toBe(true)
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
    it('滚动只更新 Plot 范围，主题变化只重建绘图投影', async () => {
      manager.enableMainIndicator('BOLL')
      const data = createTestData(80)
      manager.updateIndicatorData(data, { start: 20, end: 40 })
      await vi.waitFor(() =>
        expect(manager.createRenderStateReader().get('main:BOLL')).toBeDefined(),
      )
      const initial = manager.createRenderStateReader().get<PlotRenderState>('main:BOLL')!
      manager.updateVisibleRangeForFrame({ start: 40, end: 60 })
      const scrolled = manager.createRenderStateReader().get<PlotRenderState>('main:BOLL')!
      expect(scrolled.plots).toBe(initial.plots)
      expect(scrolled.visibleMin).not.toBe(initial.visibleMin)
      const dark = resolveThemeColors('dark', false)
      harness.deps.plotColors$.set(dark)
      const themed = manager.createRenderStateReader().get<PlotRenderState>('main:BOLL')!
      expect(themed.plots[0]?.color).toBe(dark.boll.upper)
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
