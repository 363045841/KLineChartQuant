// @vitest-environment jsdom
/** 通过图表控制器验证布局恢复、目录同步和计算计划的提交顺序。 */
import 'fake-indexeddb/auto'
import { ShapeSize } from '@363045841yyt/klinechart-plot-contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarketDataContext } from '@/data/management/impl/context.js'
import { createDataSourceFixture } from '@/data/provider/__tests__/helpers/providerTestKit.js'
import { installChartDomStubs, stubAnimationFrame } from '@/engine/__tests__/helpers/chartDomTestKit.js'
import { createTestDefinitions } from '@/engine/indicators/__tests__/helpers/definitionsTestKit.js'
import { createTestData } from '@/engine/indicators/__tests__/helpers/instanceTestKit.js'
import type { IndicatorMetadata } from '@/engine/indicators/indicatorMetadata.js'
import { createPlotIndicatorDefinition } from '@/engine/indicators/pipeline/impl/createPlotDefinition.js'
import type { DefinitionRegistry } from '@/engine/indicators/registry/index.js'
import type { IndicatorSeries } from '@/engine/plots/types.js'
import { batch } from '@/foundation/reactivity/signal.js'
import { createTestChartController as createChartController } from './helpers/controllerTestKit.js'
import { createIndicatorCatalog } from '../indicatorCatalog/index.js'
import type { ChartController, ChartMountOptions } from '../types.js'

const bars = createTestData(20)
const controllers = new Set<ChartController>()
let definitions: DefinitionRegistry
let market: MarketDataContext
let mountOptions: Pick<ChartMountOptions, 'layoutStorageId' | 'symbols'> & {
  market: MarketDataContext
  definitions: DefinitionRegistry
}
let restoreDom: () => void

beforeEach(async () => {
  definitions = createTestDefinitions()
  restoreDom = installChartDomStubs()
  stubAnimationFrame()
  market = new MarketDataContext()
  market.registerDataSource(createDataSourceFixture(bars, false).source)
  const instrument = await market.resolveInstrument('test', 'A')
  mountOptions = {
    layoutStorageId: crypto.randomUUID(),
    market,
    definitions,
    symbols: [{ instrument, period: 'daily' }],
  }
})

afterEach(async () => {
  await Promise.all([...controllers].map((controller) => controller.dispose()))
  controllers.clear()
  market.dispose()
  document.body.replaceChildren()
  restoreDom()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** 挂载真实控制器，首次创建和刷新共享同一个布局归档。 */
async function mount(symbolSource: 'options' | 'layout' = 'options'): Promise<ChartController> {
  const container = document.createElement('div')
  document.body.append(container)
  const { symbols, ...options } = mountOptions
  const controller = await createChartController({
    ...options,
    container,
    ...(symbolSource === 'options' ? { symbols } : {}),
  })
  controllers.add(controller)
  return controller
}

/** 通过正常 Plot 入口构造有确定输出的指标，可重复提交同一个脚本版本。 */
function plot(name: string, position: 'main' | 'sub', value: number) {
  const compute = vi.fn((): IndicatorSeries => ({
    plots: [
      {
        kind: 'line',
        id: 'value',
        label: 'Value',
        visible: true,
        offset: 0,
        size: ShapeSize.auto,
        dash: [],
        data: bars.map(() => ({ value, color: 'red' })),
      },
    ],
    fills: [],
  }))
  const sourceDefinition = { kind: 'indicator' as const, name, position, inputs: {} }
  const definition = createPlotIndicatorDefinition({
    ...sourceDefinition,
    source: 'script',
    document: {
      identity: 'user',
      revision: 1,
      source: `// ${name}`,
      folder: '',
      definition: sourceDefinition,
    },
    compute: () => ({ series: compute() }),
  })
  return { definition, compute }
}

/** 注册静态目录或已装配定义，校验注册成功后再验证执行。 */
function register(definition: IndicatorMetadata, load?: () => Promise<IndicatorMetadata>): void {
  const { name, displayName, category, defaultPaneId, kind } = definition
  if (kind !== 'indicator') throw new TypeError('Expected an indicator fixture')
  const candidate = { key: name, origin: 'third-party', identity: 'native' } as const
  const item = load
    ? {
        kind: 'descriptor' as const,
        candidate,
        descriptor: { kind, name, displayName, category, defaultPaneId },
        load,
      }
    : { kind: 'definition' as const, candidate, definition }
  expect(definitions.register([item]).failures).toEqual([])
}

/** 经数值查询公开入口读取图表计算结果。 */
async function lastValue(controller: ChartController, indicator: string) {
  const result = await controller.agent.tools.indicators.series(
    { indicator, limit: 1 },
    { signal: new AbortController().signal, progress: () => {} },
  )
  return result.series.rows.at(-1)?.at(-1)
}

describe('indicator runtime projection', () => {
  it.each(['cold mount', 'apply with data'])(
    'automatically computes all restored indicators on %s',
    async (entry) => {
      const error = vi.spyOn(console, 'error')
      const main = plot('RestoredOverlay', 'main', 10)
      const sub = plot('RestoredOscillator', 'sub', 20)
      register(main.definition)
      register(sub.definition)
      const original = await mount()
      await vi.waitFor(() => expect(original.getData()).toHaveLength(bars.length))
      expect(original.addIndicator(main.definition.name)).not.toBeNull()
      expect(original.addIndicator(sub.definition.name)).not.toBeNull()
      await original.saveLayout({ name: 'Saved indicators' })
      const layout = original.exportLayout()
      const instances = original.indicators.peek().map(({ id, paneId }) => ({ id, paneId }))
      if (entry === 'cold mount') {
        await original.dispose()
        controllers.delete(original)
      } else {
        original.clearAllIndicators()
      }
      definitions.clear()
      main.compute.mockClear()
      sub.compute.mockClear()

      let releaseSub!: (definition: IndicatorMetadata) => void
      const pendingSub = new Promise<IndicatorMetadata>((resolve) => {
        releaseSub = resolve
      })
      register(main.definition, async () => main.definition)
      register(sub.definition, () => pendingSub)
      expect(createIndicatorCatalog(definitions)().map(({ id }) => id)).toEqual([
        main.definition.name,
        sub.definition.name,
      ])
      expect(definitions.getDefinition(main.definition.name)).toBeUndefined()
      const restoring =
        entry === 'cold mount' ? mount('layout') : original.applyLayout(layout).then(() => original)
      try {
        await vi.waitFor(() => expect(main.compute).toHaveBeenCalled())
        expect(sub.compute).not.toHaveBeenCalled()
      } finally {
        releaseSub(sub.definition)
        await restoring
      }
      const restored = await restoring

      await vi.waitFor(() => expect(sub.compute).toHaveBeenCalled())
      expect(restored.indicators.peek().map(({ id, paneId }) => ({ id, paneId }))).toEqual(instances)
      const indicatorRows = restored.objects.groups
        .peek()
        .flatMap(({ rows }) => rows)
        .filter(({ kind }) => kind === 'indicator')
      expect(indicatorRows.map(({ domainId }) => domainId).sort()).toEqual(
        instances.map(({ id }) => id).sort(),
      )
      await vi.waitFor(() => {
        for (const [index, instance] of instances.entries()) {
          expect(restored.getIndicatorValues(instance.paneId, bars.length - 1)).toContainEqual({
            id: `${instance.id}:value`,
            value: [10, 20][index],
          })
        }
      })
      expect(error).not.toHaveBeenCalled()
    },
  )

  it('synchronizes every catalog write in a batch and shares a calculation across panes', async () => {
    const error = vi.spyOn(console, 'error')
    const main = plot('SharedOverlay', 'main', 10)
    const sub = plot('OtherOscillator', 'sub', 20)
    const chart = await mount()
    await vi.waitFor(() => expect(chart.getData()).toHaveLength(bars.length))

    batch(() => {
      register(main.definition)
      register(sub.definition)
      expect(chart.addIndicator(main.definition.name, {}, 'main')).not.toBeNull()
      expect(chart.addIndicator(main.definition.name, {}, 'sub')).not.toBeNull()
      expect(chart.addIndicator(sub.definition.name)).not.toBeNull()
    })

    await vi.waitFor(() => {
      expect(main.compute).toHaveBeenCalledOnce()
      expect(sub.compute).toHaveBeenCalledOnce()
    })
    expect(chart.indicators.peek()).toHaveLength(3)
    expect(error).not.toHaveBeenCalled()
  })

  it('replaces cached results with the new calculator and removes the instance on unregister', async () => {
    const error = vi.spyOn(console, 'error')
    const before = plot('EditableOscillator', 'sub', 10)
    const after = plot('EditableOscillator', 'sub', 20)
    const chart = await mount()
    await vi.waitFor(() => expect(chart.getData()).toHaveLength(bars.length))
    register(before.definition)
    expect(chart.addIndicator(before.definition.name)).not.toBeNull()
    await vi.waitFor(() => expect(before.compute).toHaveBeenCalledOnce())
    expect(await lastValue(chart, before.definition.name)).toBe(10)
    const [instance] = chart.indicators.peek()

    register(after.definition)

    await vi.waitFor(() => expect(after.compute).toHaveBeenCalledOnce())
    expect(await lastValue(chart, after.definition.name)).toBe(20)
    expect(chart.indicators.peek()).toEqual([instance])
    expect(before.compute).toHaveBeenCalledOnce()
    expect(after.compute).toHaveBeenCalledOnce()

    definitions.unregister(after.definition.name)

    expect(chart.indicators.peek()).toEqual([])
    expect(chart.paneLayout.peek()).toHaveLength(1)
    expect(error).not.toHaveBeenCalled()
  })
})
