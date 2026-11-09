/**
 * 编译阶段的定义工厂：把中立的 Plot 指标定义装配成 core 的指标定义类。
 *
 * 只做装配，不写注册表；脚本与第三方来源都通过它产出 `RegistrableIndicator`。
 */
import {
  Format,
  type IndicatorDefinition,
  type InputDef,
  type InputSchema,
  resolveInputDefaults,
} from '@363045841yyt/klinechart-plot-contracts'
import { Indicator, type IndicatorDefinitionClass } from '@/engine/indicators/indicatorDecorator.js'
import {
  type IndicatorInputDef,
  IndicatorKind,
  type ScaleRendererFactory,
} from '@/engine/indicators/indicatorMetadata.js'
import { toPlotBar } from '@/engine/indicators/plotBars.js'
import { createPlotTitleInfo } from '@/engine/plots/impl/plotTitleInfo.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
import { formatPlotValue } from '@/engine/plots/impl/plotValueFormat.js'
import { createIndicatorScaleLayer } from '@/engine/renderers/Indicator/scale/indicator_scale.js'

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

/** 非价格档位的指标级 format 覆盖坐标轴刻度；价格档位不提供覆盖，沿用自适应小数位。 */
function createScaleRendererFactory(
  format: Format,
  label: string,
  indicatorKey: string,
): ScaleRendererFactory | undefined {
  if (format === Format.Price) return undefined
  return (options) =>
    createIndicatorScaleLayer({
      axisWidth: options.axisWidth,
      paneId: options.paneId,
      indicatorKey,
      label,
      decimals: 2,
      getCrosshair: options.getCrosshair,
      formatTickLabel: (value) => formatPlotValue(format, value),
      formatCrosshairLabel: (value) => formatPlotValue(format, value),
      instanceId: options.instanceId,
    })
}

/**
 * 把中立指标定义装配成 core 可注册的定义类。
 *
 * @param definition 已绑定计算入口的中立定义
 * @returns 声明了 @Indicator 元数据的定义类，交给注册阶段写入
 */
export function createPlotIndicatorDefinition<P>(
  definition: IndicatorDefinition<P>,
): IndicatorDefinitionClass {
  const main = definition.position === 'main'
  const internalName = definition.id ?? definition.name
  const paneId = main ? 'main' : `sub_${internalName}`
  const format = definition.format
  const decorate = Indicator({
    name: internalName,
    source: definition.source,
    document: definition.document,
    displayName: definition.name,
    title: definition.title,
    info: definition.info,
    kind: IndicatorKind.Indicator,
    category: main ? 'main' : 'sub',
    defaultPaneId: paneId,
    allowMainPane: main,
    mainPane: main ? { toActiveConfig: (params, active) => (active ? params : null) } : undefined,
    scale: { label: definition.name, decimals: 2 },
    scaleRendererFactory: format
      ? createScaleRendererFactory(format, definition.name, internalName)
      : undefined,
    plots: { source: 'collection', series: [] },
    getTitleInfo: createPlotTitleInfo(definition.name, format),
    runtime: {
      revision: definition.document?.revision,
      dependency: definition.dependency ?? Object.freeze({ kind: 'stateful' } as const),
      defaultParams: resolveInputDefaults(definition.inputs),
      inputDefs: resolveInputDefs(definition.inputs),
      createCompute: definition.createCompute
        ? () => {
            const compute = definition.createCompute!()
            return Object.assign(
              (
                data: readonly import('@/foundation/types/price.js').KLineData[],
                params: P,
                market?: import('@363045841yyt/klinechart-plot-contracts').IndicatorMarketContext,
                range?: import('@363045841yyt/klinechart-plot-contracts').ComputeRange,
              ) => compute(data.map(toPlotBar), params, market, range),
              { dispose: () => compute.dispose() },
            )
          }
        : undefined,
      compute: (data, params, market, range) =>
        definition.compute(data.map(toPlotBar), params, market, range),
    },
  })
  class PlotIndicatorDefinition {
    static rendererFactory = plotRenderer(internalName)
  }
  decorate(PlotIndicatorDefinition)
  return PlotIndicatorDefinition
}
