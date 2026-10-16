/**
 * 按中立指标定义注册「产出 PlotCollection」的指标。
 *
 * 生产方（脚本等）只提供 IndicatorDefinition；本模块负责把行情映射成 Bar、绑定通用
 * Plot Layer，并落入指标目录，使 core 成为纯粹的消费者，不必接触生产方的模型。
 */
import {
  type Bar,
  type IndicatorDefinition,
  type InputDef,
  type InputSchema,
  resolveInputDefaults,
} from '@363045841yyt/klinechart-plot-contracts'
import type { KLineData } from '../../foundation/types/price.js'
import { plotRenderer } from '../plots/impl/plotDefinition.js'
import {
  Indicator,
  type IndicatorDefinitionClass,
  registerIndicatorDefinition,
  updateIndicatorDefinition,
} from './indicatorDefinitionRegistry.js'
import { type IndicatorInputDef, IndicatorKind } from './indicatorMetadata.js'

/** 把 core 行情映射为中立 Bar。 */
function toBar(bar: KLineData): Bar {
  return {
    time: bar.timestamp,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume ?? 0,
  }
}

/** 提取参数展示声明；默认值与类型仍由 defaultParams 提供，两处不重复存默认值。 */
function resolveInputDefs<P>(inputs: InputSchema<P>): Record<string, IndicatorInputDef> {
  const defs: Record<string, IndicatorInputDef> = {}
  for (const [key, def] of Object.entries(inputs as Record<string, InputDef<unknown>>)) {
    defs[key] = {
      ...(def.min === undefined ? {} : { min: def.min }),
      ...(def.max === undefined ? {} : { max: def.max }),
      ...(def.step === undefined ? {} : { step: def.step }),
      ...(def.title === undefined ? {} : { title: def.title }),
      ...(def.options === undefined ? {} : { options: def.options }),
    }
  }
  return defs
}

/**
 * 注册一个由 IndicatorDefinition 描述的 Plot 指标。
 *
 * 位置缺省放副图；内部身份取 `id ?? name`（脚本由宿主分配稳定 ID），
 * displayName 与坐标轴标签取 name（可编辑展示名）。
 */
export function registerPlotIndicator<P>(definition: IndicatorDefinition<P>): void {
  registerIndicatorDefinition(createPlotIndicatorDefinition(definition))
}

/** 保存完整脚本后显式更新同一指标的元数据与执行端口。 */
export function updatePlotIndicator<P>(definition: IndicatorDefinition<P>): void {
  updateIndicatorDefinition(createPlotIndicatorDefinition(definition))
}

/** 注册与更新共用中立定义转换，避免维护两套默认参数或位置映射。 */
function createPlotIndicatorDefinition<P>(
  definition: IndicatorDefinition<P>,
): IndicatorDefinitionClass {
  const main = definition.position === 'main'
  const internalName = definition.id ?? definition.name
  const paneId = main ? 'main' : `sub_${internalName}`
  const decorate = Indicator({
    name: internalName,
    source: definition.source,
    document: definition.document,
    displayName: definition.name,
    kind: IndicatorKind.Indicator,
    category: main ? 'main' : 'sub',
    defaultPaneId: paneId,
    allowMainPane: main,
    mainPane: main ? { toActiveConfig: (params, active) => (active ? params : null) } : undefined,
    scale: { label: definition.name, decimals: 2 },
    plots: { source: 'collection', series: [] },
    runtime: {
      revision: definition.document?.revision,
      defaultParams: resolveInputDefaults(definition.inputs),
      inputDefs: resolveInputDefs(definition.inputs),
      compute: (data, params: P) => definition.compute(data.map(toBar), params),
    },
  })
  class PlotIndicatorDefinition {
    static rendererFactory = plotRenderer(internalName)
  }
  decorate(PlotIndicatorDefinition)
  return PlotIndicatorDefinition
}
