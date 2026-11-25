/**
 * Plot 指标测试装配夹具：把中立 Plot 定义注册为引擎可执行定义，
 * 让 Core 的投影/调度测试不依赖已迁移到 Script 包的指标实现。
 * 仅供 __tests__ 消费；vitest 只收集 *.test.ts，本文件不会被当作测试。
 */

import type {
  Bar,
  IndicatorComputeOptions,
  IndicatorDefinition,
  InputDef,
} from '@363045841yyt/klinechart-plot-contracts'
import type { IndicatorSeries } from '@/engine/plots/types.js'
import type { IndicatorInputs, IndicatorInputValue } from '../../instances/domain/indicatorModel.js'
import { createPlotIndicatorDefinition } from '../../pipeline/impl/createPlotDefinition.js'
import { registerIndicators } from '../../pipeline/index.js'

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
 */
export function registerPlotIndicatorFixture(config: PlotIndicatorFixtureConfig): void {
  const defaults = config.defaultInputs ?? { factor: 1 }
  const inputs: Record<string, InputDef<IndicatorInputValue>> = {}
  for (const [key, value] of Object.entries(defaults)) {
    inputs[key] = { default: value }
  }
  registerPlotDefinition({
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
 * 夹具统一按指标注册；需要警报定义的用例直接构造完整定义。
 *
 * @param definition 中立指标定义（省略 kind）
 */
export function registerPlotDefinition(
  definition: Omit<IndicatorDefinition<IndicatorInputs>, 'kind' | 'frequency' | 'compute'> & {
    compute(options: IndicatorComputeOptions<IndicatorInputs>): IndicatorSeries
  },
): void {
  const definitionClass = createPlotIndicatorDefinition({
    ...definition,
    kind: 'indicator',
    compute: (options) => ({ series: definition.compute(options) }),
  })
  registerIndicators([
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
 * @param id 指标稳定身份
 */
export function registerEmptyPlot(id: string): void {
  registerPlotDefinition({
    id,
    name: id,
    source: 'script',
    inputs: {},
    compute: () => ({ plots: [], fills: [] }),
  })
}

/** 参数读取便捷入口；测试用例只关心 bars 与参数。 */
export type TestComputeOptions = IndicatorComputeOptions<IndicatorInputs>


