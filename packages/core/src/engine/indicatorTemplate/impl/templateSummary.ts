/**
 * 模板指标摘要：把指标实例汇总成定义级名称。
 *
 * @remarks
 * 摘要来自注册表当前值，显示定义元数据里的 name；未注册时退回定义 ID。
 * 多实例合并成「名称 x N」，与 TradingView 的「PVP x 2」保持一致。
 */

import { getRegisteredIndicatorDefinition } from '../../indicators/pipeline/index.js'
import type { IndicatorInstanceConfig } from '../../state/indicatorState.js'
import type { IndicatorTemplateIndicator, TemplateWorkspaces } from '../types.js'

/**
 * 把一组指标实例汇总成定义级摘要。
 *
 * @param instances 按界面顺序排列的指标实例。
 * @returns 按首次出现顺序排列的指标；同一定义合并并计数。
 */
export function summarizeIndicators(
  instances: ReadonlyArray<IndicatorInstanceConfig>,
): ReadonlyArray<IndicatorTemplateIndicator> {
  const counts = new Map<string, { label: string; count: number }>()
  for (const instance of instances) {
    const definition = getRegisteredIndicatorDefinition(instance.indicatorId)
    // name 是定义元数据里的稳定标识；模板摘要显示它而不是可本地化的 title。
    const label = definition?.name ?? instance.indicatorId
    const entry = counts.get(instance.indicatorId)
    if (entry) entry.count += 1
    else counts.set(instance.indicatorId, { label, count: 1 })
  }
  return Object.freeze(
    [...counts].map(([id, { label, count }]) => Object.freeze({ id, label, count })),
  )
}

/**
 * 把一组指标实例汇总成显示名。
 *
 * @param instances 按界面顺序排列的指标实例。
 * @returns 按首次出现顺序排列的 name 元数据；同一定义出现多次时为「名称 x N」。
 */
export function summarizeIndicatorLabels(
  instances: ReadonlyArray<IndicatorInstanceConfig>,
): ReadonlyArray<string> {
  return Object.freeze(
    summarizeIndicators(instances).map(({ label, count }) =>
      count > 1 ? `${label} x ${count}` : label,
    ),
  )
}

/**
 * 生成模板的指标名称汇总。
 *
 * @param workspaces 模板的两个数据视图快照。
 * @returns 按首次出现顺序排列的显示名；同一定义出现多次时为「名称 x N」。
 */
export function summarizeTemplateIndicators(workspaces: TemplateWorkspaces): ReadonlyArray<string> {
  return summarizeIndicatorLabels(
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
export function findMissingIndicators(workspaces: TemplateWorkspaces): ReadonlyArray<string> {
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
