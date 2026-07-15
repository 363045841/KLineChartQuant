/**
 * 插件宿主 - 核心管理类
 */
import { KLineChartError } from '../../errors'

import { ConfigManager } from './ConfigManager'
import { EventBus } from './EventBus'
import { HookSystem } from './HookSystem'
import { PluginRegistry } from './PluginRegistry'
import { StateStore } from './StateStore'
import type {
  Plugin,
  PluginConfig,
  PluginHost,
  PluginState,
  BaseIndicatorState,
  PluginLogger,
  HookCallOptions,
} from './types'

export class PluginHostImpl implements PluginHost {
  private registry: PluginRegistry
  private eventBus: EventBus
  private hookSystem: HookSystem
  private configManager: ConfigManager
  private stateStore: StateStore
  private services = new Map<string, unknown>()
  private isDestroyed = false
  private logger: PluginLogger

  constructor(logger?: PluginLogger) {
    this.registry = new PluginRegistry()
    this.eventBus = new EventBus()
    this.hookSystem = new HookSystem()
    this.configManager = new ConfigManager()
    this.stateStore = new StateStore()
    this.logger = logger ?? console
  }

  // 实现 PluginHost 接口
  readonly events = {
    on: <T = unknown>(event: string, handler: (data: T) => void) => {
      this.eventBus.on(event, handler)
    },
    off: <T = unknown>(event: string, handler: (data: T) => void) => {
      this.eventBus.off(event, handler)
    },
    emit: <T = unknown>(event: string, data: T) => {
      this.eventBus.emit(event, data)
    },
    once: <T = unknown>(event: string, handler: (data: T) => void) => {
      this.eventBus.once(event, handler)
    },
  }

  readonly hooks = {
    tap: <T = unknown, R = unknown>(
      hookName: string,
      fn: (context: T) => R | Promise<R>,
      priority = 0,
    ) => {
      this.hookSystem.tap(hookName, fn, priority)
    },
    untap: (hookName: string, fn: (context: unknown) => unknown) => {
      this.hookSystem.untap(hookName, fn)
    },
    call: async <T = unknown, R = unknown>(
      hookName: string,
      context: T,
      options?: HookCallOptions,
    ) => {
      return this.hookSystem.call<T, R>(hookName, context, options)
    },
    callSync: <T = unknown, R = unknown>(
      hookName: string,
      context: T,
      options?: HookCallOptions,
    ) => {
      return this.hookSystem.callSync<T, R>(hookName, context, options)
    },
  }

  getConfig<K = unknown>(pluginName: string, key: string, defaultValue?: K): K {
    return this.configManager.get<K>(pluginName, key, defaultValue)
  }

  setConfig(pluginName: string, key: string, value: unknown): void {
    this.configManager.set(pluginName, key, value)
  }

  getPlugin<T extends Plugin = Plugin>(name: string): T | undefined {
    return this.registry.getPlugin<T>(name)
  }

  log(level: 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void {
    const timestamp = new Date().toISOString()
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`
    this.logger[level](`${prefix} ${message}`, ...args)
  }

  // ============ 状态存储 API ============

  setSharedState<T extends BaseIndicatorState>(
    namespace: string,
    state: T,
    ownerId?: string,
  ): void {
    this.stateStore.setState(namespace, state, ownerId)
  }

  getSharedState<T extends BaseIndicatorState>(namespace: string): T | undefined {
    return this.stateStore.getState<T>(namespace)
  }

  clearSharedState(namespace: string): void {
    this.stateStore.clearState(namespace)
  }

  registerStateOwner(ownerId: string, namespaces: string[]): void {
    this.stateStore.registerStateOwner(ownerId, namespaces)
  }

  clearByOwner(ownerId: string): void {
    this.stateStore.clearByOwner(ownerId)
  }

  registerService(name: string, service: unknown): void {
    this.services.set(name, service)
  }

  getService<T = unknown>(name: string): T | undefined {
    return this.services.get(name) as T | undefined
  }

  /**
   * 安装插件
   */
  async use(plugin: Plugin, config?: PluginConfig): Promise<void> {
    this.ensureNotDestroyed()

    if (this.registry.has(plugin.name)) {
      throw new KLineChartError('INVALID_STATE', `Plugin "${plugin.name}" is already installed`)
    }

    try {
      // 注册插件
      const descriptor = this.registry.register(plugin, config)

      // 注册默认配置
      if (config) {
        this.configManager.setAll(plugin.name, config)
      }

      // 触发安装前钩子
      await this.hooks.call('plugin:beforeInstall', { plugin, config }, { throwOnError: true })

      // 安装插件
      await plugin.install(this, descriptor.config)

      // 更新状态
      this.registry.updateState(plugin.name, 'installed' as PluginState)

      // 触发安装后钩子
      await this.hooks.call('plugin:afterInstall', { plugin, config }, { throwOnError: true })

      this.log('info', `Plugin "${plugin.name}" installed successfully`)
    } catch (error) {
      this.registry.updateState(
        plugin.name,
        'error' as PluginState,
        error instanceof Error ? error : new Error(String(error)),
      )
      this.log('error', `Failed to install plugin "${plugin.name}":`, error)
      throw error
    }
  }

  /**
   * 移除插件
   */
  async remove(name: string): Promise<void> {
    this.ensureNotDestroyed()

    const descriptor = this.registry.get(name)
    if (!descriptor) {
      throw new KLineChartError('INVALID_STATE', `Plugin "${name}" is not installed`)
    }

    try {
      // 触发卸载前钩子
      await this.hooks.call('plugin:beforeUninstall', { name }, { throwOnError: true })

      // 调用插件的卸载方法
      if (descriptor.plugin.uninstall) {
        await descriptor.plugin.uninstall()
      }

      // 清理
      this.registry.unregister(name)
      this.configManager.clear(name)

      // 触发卸载后钩子
      await this.hooks.call('plugin:afterUninstall', { name }, { throwOnError: true })

      this.log('info', `Plugin "${name}" removed successfully`)
    } catch (error) {
      this.log('error', `Failed to remove plugin "${name}":`, error)
      throw error
    }
  }

  /**
   * 获取所有插件
   */
  getPlugins() {
    return this.registry.getAll()
  }

  /**
   * 获取插件状态
   */
  getState(name: string): PluginState | undefined {
    return this.registry.get(name)?.state
  }

  /**
   * 销毁宿主
   */
  async destroy(): Promise<void> {
    if (this.isDestroyed) return

    // 卸载所有插件
    for (const descriptor of this.registry.getAll()) {
      try {
        if (descriptor.plugin.uninstall) {
          await descriptor.plugin.uninstall()
        }
      } catch (error) {
        this.log('error', `Error uninstalling "${descriptor.plugin.name}":`, error)
      }
    }

    // 清理资源
    this.registry.clear()
    this.eventBus.clear()
    this.hookSystem.clear()
    this.configManager.clear()
    this.stateStore.clear()
    this.services.clear()

    this.isDestroyed = true
    this.log('info', 'PluginHost destroyed')
  }

  private ensureNotDestroyed(): void {
    if (this.isDestroyed) {
      throw new KLineChartError('DISPOSED', 'PluginHost has been destroyed')
    }
  }
}

// 导出工厂函数
export function createPluginHost(logger?: PluginLogger): PluginHostImpl {
  return new PluginHostImpl(logger)
}
