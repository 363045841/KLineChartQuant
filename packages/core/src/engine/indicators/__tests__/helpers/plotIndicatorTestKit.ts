/**
 * Plot 指标测试装配夹具：把中性 Plot 定义注册为引擎可执行定义，
 * 让 Core 的投影/调度测试不依赖已迁移到 Script 包的指标实现。
 * 仅供 __tests__ 消费；vitest 只收集 *.test.ts，本文件不会被当作测试。
 */
import type { PlotCollection } from '@/engine/plots/types.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
import type { KLineData } from '@/foundation/types/price.js'

import { Indicator } from '../../indicatorDecorator.js'
import { registerIndicatorDefinition } from '../../indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../../indicatorMetadata.js'
import type { IndicatorParameters } from '../../instances/domain/instanceModel.js'

/** 注册夹具的声明；compute 决定输出，defaultParams 缺省提供 factor。 */
export interface PlotIndicatorFixtureConfig {
  name: string
  category: 'main' | 'sub'
  defaultParams?: IndicatorParameters
  compute: (data: KLineData[], params: IndicatorParameters) => PlotCollection
}

/**
 * 用引擎自身能力注册一个产出 Plot 的外部指标，等价于脚本适配层做的事：
 * 外部来源只提供 Plot 数据，渲染交给引擎。
 */
export function registerPlotIndicatorFixture(config: PlotIndicatorFixtureConfig): void {
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
    runtime: { defaultParams: config.defaultParams ?? { factor: 1 }, compute: config.compute },
  })
  class PlotIndicatorFixtureDefinition {
    static rendererFactory = plotRenderer(config.name)
  }
  decorate(PlotIndicatorFixtureDefinition)
  registerIndicatorDefinition(PlotIndicatorFixtureDefinition)
}
