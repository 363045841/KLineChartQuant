/** 布局配置发布后，据此异步加载指标内容。 */
import type { LayoutDocument } from '../types.js'

/** 列出布局文档引用的全部指标定义 ID（两个视图工作区），去重保序。 */
export function collectLayoutIndicatorIds(document: LayoutDocument): string[] {
  const ids = new Set<string>()
  for (const workspace of Object.values(document.workspaces)) {
    for (const instance of workspace.instances) ids.add(instance.indicatorId)
  }
  return [...ids]
}
