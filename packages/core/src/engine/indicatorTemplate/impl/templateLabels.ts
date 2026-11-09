/**
 * 模板列表摘要：把指标定义 ID 翻译成界面可读的名称。
 *
 * @remarks
 * 摘要来自注册表当前值，所以脚本指标在注册后就显示原名，未注册时退回定义 ID。
 * 多实例折叠成「名称 x N」，与 TradingView 的「PVP x 2」保持一致。
 */

import { getRegisteredIndicatorDefinition } from '../../indicators/pipeline/index.js'
import type { IndicatorInstanceConfig } from '../../state/indicatorState.js'
import type { TemplateWorkspaces } from '../types.js'

/** 一个指标在摘要中的出现次数。 */
interface LabelCount {
  readonly label: string
  count: number
}

/**
 * 把一组指标实例折叠成显示名摘要。
 *
 * @param instances 按界面顺序排列的指标实例。
 * @returns 按首次出现顺序排列的显示名；同一定义出现多次时为「名称 x N」。
 */
export function describeIndicatorLabels(
  instances: ReadonlyArray<IndicatorInstanceConfig>,
): ReadonlyArray<string> {
  const counts = new Map<string, LabelCount>()
  for (const instance of instances) {
    const definition = getRegisteredIndicatorDefinition(instance.indicatorId)
    // title 是选择器里的长名称，缺省时用 displayName；未注册时退回定义 ID。
    const label = definition?.title ?? definition?.displayName ?? instance.indicatorId
    const entry = counts.get(instance.indicatorId)
    if (entry) entry.count += 1
    else counts.set(instance.indicatorId, { label, count: 1 })
  }
  return Object.freeze(
    [...counts.values()].map(({ label, count }) => (count > 1 ? `${label} x ${count}` : label)),
  )
}

/**
 * 生成模板的指标名摘要。
 *
 * @param workspaces 模板的两个数据视图快照。
 * @returns 按首次出现顺序排列的显示名；同一定义出现多次时为「名称 x N」。
 */
export function describeTemplateIndicators(workspaces: TemplateWorkspaces): ReadonlyArray<string> {
  return describeIndicatorLabels(
    Object.values(workspaces).flatMap((workspace) => workspace.instances),
  )
}

/**
 * 列出模板中无法注册的指标定义 ID，去重保序。
 *
 * @remarks
 * 用户删掉脚本或换了环境后，模板仍可能在归档里引用旧定义。应用后把这份清单
 * 交给界面提示「哪几个没恢复」，而不是静默少恢复几个指标。
 */
export function describeMissingIndicators(workspaces: TemplateWorkspaces): ReadonlyArray<string> {
  const missing = new Set<string>()
  for (const workspace of Object.values(workspaces)) {
    for (const instance of workspace.instances) {
      if (!getRegisteredIndicatorDefinition(instance.indicatorId)) missing.add(instance.indicatorId)
    }
  }
  return Object.freeze([...missing])
}

/** 两个数据视图合计的指标实例数。 */
export function countWorkspaceInstances(workspaces: TemplateWorkspaces): number {
  return Object.values(workspaces).reduce(
    (total, workspace) => total + workspace.instances.length,
    0,
  )
}
