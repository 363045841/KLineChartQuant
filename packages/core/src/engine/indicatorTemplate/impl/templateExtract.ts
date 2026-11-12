/**
 * 从图表工作区快照中提取指标组合，供模板保存使用。
 *
 * @remarks
 * 只取指标实例与窗格顺序/高度；轴类型、价格轴模式等布局专属字段不进入模板，
 * 因为它们描述的是「这张图表怎么显示」，而不是「用了哪些指标」。
 */

import { ChartWorkspaceId } from '../../../foundation/types/chartView.js'
import type { LayoutWorkspaces } from '../../layout/types.js'
import { MAIN_PANE_ID } from '../../pane/types.js'
import type { TemplateWorkspace, TemplateWorkspaces } from '../types.js'

/** 提取单个视图的指标组合；实例在布局快照里已经是纯用户配置。 */
function extractWorkspace(workspace: LayoutWorkspaces[ChartWorkspaceId]): TemplateWorkspace {
  return Object.freeze({
    instances: workspace.instances,
    paneSpecs: workspace.paneSpecs,
  })
}

/**
 * 从布局工作区中提取模板需要的指标组合。
 *
 * @param workspaces 当前图表两个数据视图的布局快照。
 * @returns 只含指标实例与窗格顺序/高度的模板快照。
 */
export function extractTemplate(workspaces: LayoutWorkspaces): TemplateWorkspaces {
  return Object.freeze({
    [ChartWorkspaceId.KLine]: extractWorkspace(workspaces[ChartWorkspaceId.KLine]),
    [ChartWorkspaceId.TimeShare]: extractWorkspace(workspaces[ChartWorkspaceId.TimeShare]),
  })
}

/** 列出模板引用的全部指标定义 ID（两个视图），去重保序。 */
export function collectTemplateIndicatorIds(workspaces: TemplateWorkspaces): string[] {
  const ids = new Set<string>()
  for (const workspace of Object.values(workspaces)) {
    for (const instance of workspace.instances) ids.add(instance.indicatorId)
  }
  return [...ids]
}

/**
 * 按指标定义过滤模板组合。
 *
 * @param workspaces 当前图表的模板快照。
 * @param indicatorIds 只保留这些指标定义；undefined 表示保留全部。
 * @returns 过滤后的模板组合；未保留指标的副图 pane 一并移除，主图始终保留。
 */
export function selectTemplateIndicators(
  workspaces: TemplateWorkspaces,
  indicatorIds: ReadonlyArray<string> | undefined,
): TemplateWorkspaces {
  if (indicatorIds === undefined) return workspaces
  const allowed = new Set(indicatorIds)
  const selectWorkspace = (workspace: TemplateWorkspace): TemplateWorkspace => {
    const instances = workspace.instances.filter((instance) => allowed.has(instance.indicatorId))
    const paneIds = new Set(instances.map((instance) => instance.paneId))
    return Object.freeze({
      instances: Object.freeze(instances),
      paneSpecs: Object.freeze(
        workspace.paneSpecs.filter((spec) => spec.id === MAIN_PANE_ID || paneIds.has(spec.id)),
      ),
    })
  }
  return Object.freeze({
    [ChartWorkspaceId.KLine]: selectWorkspace(workspaces[ChartWorkspaceId.KLine]),
    [ChartWorkspaceId.TimeShare]: selectWorkspace(workspaces[ChartWorkspaceId.TimeShare]),
  })
}
