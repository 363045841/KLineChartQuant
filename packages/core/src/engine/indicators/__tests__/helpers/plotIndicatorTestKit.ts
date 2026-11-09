/**
 * Plot 指标测试装配夹具：把中立 Plot 定义注册为引擎可执行定义，
 * 让 Core 的投影/调度测试不依赖已迁移到 Script 包的指标实现。
 * 仅供 __tests__ 消费；vitest 只收集 *.test.ts，本文件不会被当作测试。
 */

import type { Bar, InputDef, IndicatorDefinition } from '@363045841yyt/klinechart-plot-contracts'
import type { PlotCollection } from '@/engine/plots/types.js'
import type {
  IndicatorParameters,
  IndicatorParameterValue,
} from '../../instances/domain/instanceModel.js'
import { createPlotIndicatorDefinition } from '../../pipeline/impl/createPlotDefinition.js'
import { registerIndicators } from '../../pipeline/index.js'

/** 注册夹具的声明；compute 决定输出，defaultParams 缺省提供 factor。 */
export interface PlotIndicatorFixtureConfig {
  name: string
  category: 'main' | 'sub'
  defaultParams?: IndicatorParameters
  compute: (data: readonly Bar[], params: IndicatorParameters) => PlotCollection
}

/**
 * 用引擎自身能力注册一个产出 Plot 的外部指标，等价于脚本适配层做的事：
 * 外部来源只提供 Plot 数据，渲染交给引擎。
 */
export function registerPlotIndicatorFixture(config: PlotIndicatorFixtureConfig): void {
  const defaults = config.defaultParams ?? { factor: 1 }
  const inputs: Record<string, InputDef<IndicatorParameterValue>> = {}
  for (const [key, value] of Object.entries(defaults)) {
    inputs[key] = { default: value }
  }
  registerPlotDefinition({
    id: config.name,
    name: config.name,
    source: 'native',
    position: config.category,
    inputs,
    compute: config.compute,
  })
}

/**
 * 用中立 Plot 定义注册/替换指标，供生命周期测试复用注册阶段语义。
 *
 * @param definition 中立指标定义
 */
export function registerPlotDefinition<P>(definition: IndicatorDefinition<P>): void {
  const definitionClass = createPlotIndicatorDefinition(definition)
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
