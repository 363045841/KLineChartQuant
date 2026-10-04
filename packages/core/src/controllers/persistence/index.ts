/**
 * persistence 模块公共出口。
 *
 * 控制器层的浏览器持久化适配器：把 engine state 的快照契约绑定到 localStorage。
 * 调用方应从本模块导入，避免直接依赖 impl/ 下的实现文件。
 */

export {
  createPanePriceAxisPersistence,
  loadStoredPanePriceAxisModes,
  PANE_PRICE_AXIS_MODES_STORAGE_KEY,
} from './impl/panePriceAxisPersistence.js'
export {
  createViewWorkspacePersistence,
  loadStoredViewWorkspaces,
  VIEW_WORKSPACES_STORAGE_KEY,
} from './impl/viewWorkspacePersistence.js'
