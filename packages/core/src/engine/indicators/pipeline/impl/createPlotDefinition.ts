/**
 * 定义适配器：把 defineIndicator / defineAlert 产出的中立定义装配成 Core 可执行定义对象。
 *
 * 只做装配，不写注册表；脚本与第三方来源都通过它产出 `RegistrableIndicator`。
 * 计算端口直通，事件随计算输出一起返回，不另设取件通道。
 */
import {
  Format,
  type IndicatorCompute,
  type IndicatorDefinition,
  type InputDef,
  type InputSchema,
  resolveInputDefaults,
} from '@363045841yyt/klinechart-plot-contracts'
import type { CalculationCompute, CalculationInputs } from '@/engine/calculation/index.js'
import {
  type IndicatorInputDisplay,
  type IndicatorMetadata,
} from '@/engine/indicators/indicatorMetadata.js'
import { toPlotBar } from '@/engine/indicators/plotBars.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
import { createPlotTitleInfo } from '@/engine/plots/impl/plotTitleInfo.js'
import { formatPlotValue } from '@/engine/plots/impl/plotValueFormat.js'

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

function adaptCompute(compute: IndicatorCompute<CalculationInputs>) {
  const run: CalculationCompute = (data, params, market, range, live) =>
    compute({ bars: data.map(toPlotBar), params, market, range, live })
  return Object.assign(run, { dispose: () => compute.dispose?.() })
}

/**
 * 把中立定义装配成 Core 可注册的定义对象。
 *
 * @param definition 已绑定计算入口的中立定义
 * @returns 完整定义对象，注册阶段直接消费
 */
export function createPlotIndicatorDefinition(
  definition: IndicatorDefinition<CalculationInputs>,
): IndicatorMetadata {
  const main = definition.position === 'main'
  const internalName = definition.id ?? definition.name
  const paneId = main ? 'main' : `sub_${internalName}`
  const format = definition.format
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
    rendererFactory: plotRenderer(internalName),
    getRendererName: ({ paneId }) => `${internalName}_${paneId}`,
    scale: {
      label: definition.name,
      decimals: 2,
      format:
        format && format !== Format.price ? (value) => formatPlotValue(format, value) : undefined,
    },
    plots: { source: 'series', series: [], format: definition.format },
    getTitleInfo: createPlotTitleInfo(definition.name),
    runtime: {
      revision: definition.document?.revision,
      dependency: definition.dependency ?? Object.freeze({ kind: 'stateful' } as const),
      defaultInputs: resolveInputDefaults(definition.inputs),
      inputDefs: resolveInputDefs(definition.inputs),
      createCompute: definition.createCompute && adaptFactory(definition.createCompute),
      compute: adaptCompute(definition.compute),
    },
  }
}

function adaptFactory(create: () => IndicatorCompute<CalculationInputs>) {
  return () => adaptCompute(create())
}
