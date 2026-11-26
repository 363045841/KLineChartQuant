/**
 * Plot 指标测试装配夹具：把中立 Plot 定义注册为引擎可执行定义，
 * 让 Core 的投影/调度测试不依赖已迁移到 Script 包的指标实现。
 * 注册表由调用方注入，夹具只负责构造定义。
 */
import type {
  Bar,
  IndicatorComputeOptions,
  IndicatorDefinition,
  InputDef,
} from '@363045841yyt/klinechart-plot-contracts'
import type { DefinitionRegistry } from '../../registry/index.js'
import type { IndicatorSeries } from '@/engine/plots/types.js'
import { createIndicatorLayerId } from '../../indicatorLayerNaming.js'
import type { IndicatorInputs, IndicatorInputValue } from '../../instances/domain/indicatorModel.js'
import { createPlotIndicatorDefinition } from '../../pipeline/impl/createPlotDefinition.js'

/** 注册夹具的声明；compute 决定输出，defaultInputs 缺省提供 factor。 */
export interface PlotIndicatorFixtureConfig {
  name: string
  category: 'main' | 'sub'
  defaultInputs?: IndicatorInputs
  compute: (data: readonly Bar[], inputs: IndicatorInputs) => IndicatorSeries
}

/**
 * 用引擎自身能力注册一个产出 Plot 的外部指标，等价于脚本适配层做的事：
 * 外部来源只提供 Plot 数据，渲染交给引擎。
 *
 * @param definitions 目标注册表
 * @param config 夹具名称、分类与计算入口
 */
export function registerPlotIndicatorFixture(
  definitions: DefinitionRegistry,
  config: PlotIndicatorFixtureConfig,
): void {
  const defaults = config.defaultInputs ?? { factor: 1 }
  const inputs: Record<string, InputDef<IndicatorInputValue>> = {}
  for (const [key, value] of Object.entries(defaults)) {
    inputs[key] = { default: value }
  }
  registerPlotDefinition(definitions, {
    id: config.name,
    name: config.name,
    source: 'native',
    position: config.category,
    inputs,
    compute: (options) => config.compute(options.bars, options.params),
  })
}

/**
 * 用中立 Plot 定义注册/替换指标，供生命周期测试复用注册阶段语义。
 *
 * @param definitions 目标注册表
 * @param definition 中立指标定义（省略 kind）
 */
export function registerPlotDefinition(
  definitions: DefinitionRegistry,
  definition: Omit<IndicatorDefinition<IndicatorInputs>, 'kind' | 'frequency' | 'compute'> & {
    compute(options: IndicatorComputeOptions<IndicatorInputs>): IndicatorSeries
  },
): void {
  const definitionClass = createPlotIndicatorDefinition({
    ...definition,
    kind: 'indicator',
    compute: (options) => ({ series: definition.compute(options) }),
  })
  definitions.register([
    {
      kind: 'definition',
      candidate: {
        key: definition.id ?? definition.name,
        origin: 'third-party',
        identity: 'native',
      },
      definition: definitionClass,
    },
  ])
}

/**
 * 注册一个不产出任何图形的脚本指标，供只关心布局/生命周期的用例复用。
 *
 * @param definitions 目标注册表
 * @param id 指标稳定身份
 */
export function registerEmptyPlot(definitions: DefinitionRegistry, id: string): void {
  registerPlotDefinition(definitions, {
    id,
    name: id,
    source: 'script',
    inputs: {},
    compute: () => ({ plots: [], fills: [] }),
  })
}

/**
 * 测试用 Layer ID：与生产命名共用同一实现，定义取自本次用例的注册表。
 *
 * @param definitions 本次用例的注册表
 * @param definitionId 指标身份
 * @param paneId 目标窗格
 * @param instanceId 实例身份；缺省表示静态 Layer
 * @returns 稳定 Layer 身份
 */
export function indicatorLayerId(
  definitions: DefinitionRegistry,
  definitionId: string,
  paneId: string,
  instanceId?: string,
): string {
  const definition = definitions.getDefinition(definitionId)
  if (!definition) throw new Error(`Missing test definition: ${definitionId}`)
  return createIndicatorLayerId(definition.getRendererName, definition.name, paneId, instanceId)
}
