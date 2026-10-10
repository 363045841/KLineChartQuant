/** pane 模块唯一出口：pane 领域写操作、布局算法、单 pane 画布管理与副图渲染投影。 */

export { ChartPaneLayout } from './impl/layout/chartPaneLayout.js'
export { Pane, UpdateLevel } from './impl/layout/pane.js'
export { PaneManager } from './impl/paneManager.js'
export { PaneRenderer } from './impl/paneRenderer.js'
export { hasSubPaneRendererMetadata, SubPaneManager } from './impl/subPaneManager.js'
export type {
  CreatePaneInput,
  PaneManagerDependencies,
  PanePatch,
  PaneRendererContexts,
  PaneRendererDom,
  PaneRendererOptions,
  PaneSpec,
  PaneSurfaceFactory,
  ResolvedPaneRendererOptions,
  SubPaneContext,
  SubPaneEntry,
  SubPaneResources,
} from './types.js'
