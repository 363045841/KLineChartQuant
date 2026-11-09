/**
 * 从图表工作区快照中提取指标组合，供模板保存使用。
 *
 * @remarks
 * 只取指标实例与窗格顺序/高度；轴类型、价格轴模式等布局专属字段不进入模板，
 * 因为它们描述的是「这张图表怎么显示」，而不是「用了哪些指标」。
 */

import { ChartWorkspaceId } from '../../../foundation/types/chartView.js'
import type { LayoutWorkspaces } from '../../layout/types.js'
import type { TemplateWorkspace, TemplateWorkspaces } from '../types.js'

/** 提取单个视图的指标组合；实例在布局快照里已经是纯用户配置。 */
function captureWorkspace(workspace: LayoutWorkspaces[ChartWorkspaceId]): TemplateWorkspace {
  return Object.freeze({
    instances: workspace.instances,
    paneSpecs: workspace.paneSpecs,
  })
}

/**
 * 把布局工作区快照裁剪成模板工作区。
 *
 * @param workspaces 当前图表两个数据视图的布局快照。
 * @returns 只含指标实例与窗格顺序/高度的模板快照。
 */
export function captureTemplate(workspaces: LayoutWorkspaces): TemplateWorkspaces {
  return Object.freeze({
    [ChartWorkspaceId.KLine]: captureWorkspace(workspaces[ChartWorkspaceId.KLine]),
    [ChartWorkspaceId.TimeShare]: captureWorkspace(workspaces[ChartWorkspaceId.TimeShare]),
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
