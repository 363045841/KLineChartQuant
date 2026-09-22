/**
 * 插件系统入口
 *
 * 对外契约只在 types.ts；本文件是唯一的组装点，
 * 将 impl/ 下的实现与运行时常量汇聚为公开 API。
 */

export { ConfigManager } from './impl/ConfigManager.js'
export { POINT_ROLE, PRIMITIVE_KIND } from './impl/drawingConstants.js'
export { EventBus } from './impl/EventBus.js'
export { HookSystem } from './impl/HookSystem.js'
export { createPluginHost, PluginHostImpl } from './impl/PluginHost.js'
export { PluginRegistry } from './impl/PluginRegistry.js'
export { GLOBAL_PANE_ID, RENDERER_PRIORITY } from './impl/rendererConstants.js'
export { RendererPluginManager } from './impl/rendererPluginManager.js'
export { wrapPaneInfo } from './impl/wrapPaneInfo.js'
export * from './types.js'
