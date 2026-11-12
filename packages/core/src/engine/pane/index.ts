/** pane 模块唯一出口：实例迁移命令、轴解析、布局算法、单 pane 画布管理与副图渲染投影。 */

export type { InstanceAxisMap, PaneAxisSpec } from './axisResolver.js'
export { resolveInstanceAxisMap, resolvePaneAxes } from './axisResolver.js'
export { ChartPaneLayout } from './impl/layout/chartPaneLayout.js'
export { Pane, UpdateLevel } from './impl/layout/pane.js'
export { PaneManager } from './impl/paneManager.js'
export { PaneRenderer } from './impl/paneRenderer.js'
export type {
  InstanceMoveOption,
  InstanceMoveTarget,
  PaneLayoutCommands,
} from './types.js'
