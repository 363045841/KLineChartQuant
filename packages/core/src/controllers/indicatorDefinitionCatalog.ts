/**
 * 将引擎指标目录映射为控制器指标定义。
 *
 * 对外的规范 ID 统一使用指标的 displayName，与 ChartIndicatorManager 实例身份、
 * 选择器卡片 ID 保持一致；内部 name 不再泄漏到控制器/UI 层。
 */
import { allIndicators, type Indicator } from '../engine/renderers/Indicator/indicatorCatalog'

import type { IndicatorDefinition, IndicatorParamDef } from './types'

/** 将引擎参数配置映射为控制器参数定义。 */
function toParamDef(param: NonNullable<Indicator['params']>[number]): IndicatorParamDef {
  return {
    key: param.key,
    label: param.label,
    type: param.type,
    default: param.default ?? (param.type === 'number' ? 0 : ''),
    min: param.min,
    max: param.max,
    step: param.step,
  }
}

/** 将单个引擎指标目录项映射为控制器指标定义。 */
export function toIndicatorDefinition(indicator: Indicator): IndicatorDefinition {
  return {
    id: indicator.id,
    label: indicator.label,
    name: indicator.name,
    description: indicator.description,
    role: indicator.pane,
    indicatorType: indicator.indicatorType,
    indicatorTypeLabel: indicator.indicatorTypeLabel,
    indicatorTypeOrder: indicator.indicatorTypeOrder,
    params: (indicator.params ?? []).map(toParamDef),
  }
}

/** 返回全部已注册指标的定义列表，身份统一使用展示名。 */
export function allIndicatorDefinitions(): IndicatorDefinition[] {
  return allIndicators().map(toIndicatorDefinition)
}
