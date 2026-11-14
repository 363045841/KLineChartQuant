/** pane 模块唯一出口：实例迁移命令、轴解析、布局算法、单 pane 画布管理与副图渲染投影。 */

export {
  AXIS_GROUP_DRAWING,
  AXIS_GROUP_PRICE,
  axisGroupId,
  indicatorAxisGroupKey,
} from './axisGroups.js'
export type { ObjectAxisMap, PaneAxisSpec } from './axisResolver.js'
export { resolveObjectAxisMap, resolvePaneAxes } from './axisResolver.js'
export type { ObjectAxesApi } from './axisTypes.js'
export { ChartPaneLayout } from './impl/layout/chartPaneLayout.js'
export { Pane, UpdateLevel } from './impl/layout/pane.js'
export { PaneManager } from './impl/paneManager.js'
export { type PanePlacementPort, runInNewPane } from './impl/panePlacement.js'
export { PaneRenderer } from './impl/paneRenderer.js'
export type {
  InstanceMoveTarget,
  PaneLayoutCommands,
  PanePlacement,
} from './types.js'
