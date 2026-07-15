/**
 * 插件系统入口
 */

// 核心类型
export * from './types'

// 核心类
export { PluginRegistry } from './PluginRegistry'
export { PluginHostImpl, createPluginHost } from './PluginHost'

// 子系统
export { EventBus } from './EventBus'
export { HookSystem } from './HookSystem'
export { ConfigManager } from './ConfigManager'

// 渲染器插件
export { RendererPluginManager } from './rendererPluginManager'
export type { RendererErrorEvent } from './rendererPluginManager'
