/**
 * 定义适配器：把 defineIndicator / defineAlert 产出的中立定义装配成 Core 可执行定义对象。
 *
 * 只做装配，不写注册表；产出的是纯计算描述，渲染绑定由图表侧在注册时附加。
 * 计算端口直通，事件随计算输出一起返回，不另设取件通道。
 */
import {
  type IndicatorCompute,
  type IndicatorDefinition,
  type InputDef,
  type InputSchema,
  resolveInputDefaults,
} from '@363045841yyt/klinechart-plot-contracts'
import type { CalculationCompute, CalculationInputs } from '@/engine/calculation/index.js'
import type { IndicatorInputDisplay, IndicatorMetadata } from '@/engine/indicators/indicatorMetadata.js'
import { toPlotBar } from '@/engine/indicators/plotBars.js'

/** 提取参数展示声明；默认值与类型仍由 defaultInputs 提供，两处不重复存默认值。 */
function resolveInputDefs<P>(inputs: InputSchema<P>): Record<string, IndicatorInputDisplay> {
  const defs: Record<string, IndicatorInputDisplay> = {}
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

/** 把脚本侧 options 形式的 compute 适配成 Core 侧按位置传参的 compute。 */
function adaptCompute(sourceCompute: IndicatorCompute<CalculationInputs>) {
  const adaptedCompute: CalculationCompute = (data, params, market, change, live) =>
    sourceCompute({ bars: data.map(toPlotBar), params, market, change, live })
  return Object.assign(adaptedCompute, { dispose: () => sourceCompute.dispose?.() })
}

/**
 * 把中立定义装配成 Core 可注册的计算描述。
 *
 * @param definition 已绑定计算入口的中立定义
 * @returns 定义对象；不含渲染器与标题投影
 */
export function createPlotIndicatorDefinition(
  definition: IndicatorDefinition<CalculationInputs>,
): IndicatorMetadata {
  const main = definition.position === 'main'
  const internalName = definition.id ?? definition.name
  const paneId = main ? 'main' : `sub_${internalName}`
  return {
    ...(definition.kind === 'alert'
      ? { kind: definition.kind, frequency: definition.frequency }
      : { kind: definition.kind }),
    name: internalName,
    source: definition.source,
    document: definition.document,
    displayName: definition.name,
    title: definition.title,
    info: definition.info,
    category: main ? 'main' : 'sub',
    defaultPaneId: paneId,
    getRendererName: ({ paneId: target }) => `${internalName}_${target}`,
    scale: {
      label: definition.name,
      decimals: 2,
    },
    plots: { source: 'series', series: [], format: definition.format },
    runtime: {
      revision: definition.document?.revision,
      defaultInputs: resolveInputDefaults(definition.inputs),
      inputDefs: resolveInputDefs(definition.inputs),
      createCompute: definition.createCompute && adaptComputeFactory(definition.createCompute),
      compute: adaptCompute(definition.compute),
    },
  }
}

/** 有状态计算会话工厂同样适配为 Core 侧的计算端口。 */
function adaptComputeFactory(createCompute: () => IndicatorCompute<CalculationInputs>) {
  return () => adaptCompute(createCompute())
}
