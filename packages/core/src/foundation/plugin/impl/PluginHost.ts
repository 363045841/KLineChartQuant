/**
 * 插件宿主 - 核心管理类
 */
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import {
  type BaseIndicatorState,
  type EventHandler,
  type HookCallOptions,
  type Plugin,
  type PluginConfig,
  type PluginHost,
  type PluginLogger,
  PluginState,
} from '../types.js'
import { ConfigManager } from './ConfigManager.js'
import { EventBus } from './EventBus.js'
import { HookSystem } from './HookSystem.js'
import { PluginRegistry } from './PluginRegistry.js'
import { StateStore } from './StateStore.js'

export class PluginHostImpl implements PluginHost {
  private registry: PluginRegistry
  private eventBus: EventBus
  private hookSystem: HookSystem
  private configManager: ConfigManager
  private stateStore: StateStore
  private services = new Map<string, unknown>()
  private isDestroyed = false
  private isDestroying = false
  private operations: Promise<void> = Promise.resolve()
  private destruction: Promise<void> | undefined
  private logger: PluginLogger

  constructor(logger?: PluginLogger) {
    this.registry = new PluginRegistry()
    const report = (message: string, error: unknown) => this.log('error', message, error)
    this.eventBus = new EventBus(report)
    this.hookSystem = new HookSystem(report)
    this.configManager = new ConfigManager()
    this.stateStore = new StateStore()
    this.logger = logger ?? console
  }

  // 实现 PluginHost 接口
  readonly events = {
    on: <T = unknown>(event: string, handler: EventHandler<T>) => {
      this.eventBus.on(event, handler)
    },
    off: <T = unknown>(event: string, handler: EventHandler<T>) => {
      this.eventBus.off(event, handler)
    },
    emit: <T = unknown>(event: string, data: T) => {
      this.eventBus.emit(event, data)
    },
    once: <T = unknown>(event: string, handler: EventHandler<T>) => {
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
    return this.enqueue(() => this.installPlugin(plugin, config))
  }

  /** 顺序执行插件生命周期，销毁等待已接受的操作完成。 */
  private enqueue(operation: () => Promise<void>): Promise<void> {
    this.ensureNotDestroyed()
    const result = this.operations.then(operation)
    // 单个操作的错误仍交给调用方；队列继续接收后续清理操作。
    this.operations = result.catch(() => {})
    return result
  }

  /** 安装和钩子成功后提交 Installed；失败时释放本次注册。 */
  private async installPlugin(plugin: Plugin, config?: PluginConfig): Promise<void> {
    if (this.registry.has(plugin.name)) {
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_STATE,
        `Plugin "${plugin.name}" is already installed`,
      )
    }

    const descriptor = this.registry.register(plugin, config)
    let installStarted = false
    try {
      if (config) {
        this.configManager.setAll(plugin.name, config)
      }

      // 触发安装前钩子
      await this.hooks.call('plugin:beforeInstall', { plugin, config }, { throwOnError: true })

      installStarted = true
      await plugin.install(this, descriptor.config)
      await this.hooks.call('plugin:afterInstall', { plugin, config }, { throwOnError: true })
      this.registry.updateState(plugin.name, PluginState.Installed)
    } catch (error) {
      try {
        if (installStarted) await plugin.uninstall?.()
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], `Plugin "${plugin.name}" installation and rollback failed`)
      } finally {
        this.clearPluginRegistration(plugin.name)
      }
      throw error
    }
    this.log('info', `Plugin "${plugin.name}" installed successfully`)
  }

  private clearPluginRegistration(name: string): void {
    this.registry.unregister(name)
    this.configManager.clear(name)
    this.stateStore.clearByOwner(name)
  }

  /**
   * 移除插件
   */
  async remove(name: string): Promise<void> {
    return this.enqueue(() => this.uninstallPlugin(name))
  }

  /** 卸载指定插件并清理配置。 */
  private async uninstallPlugin(name: string): Promise<void> {
    const descriptor = this.registry.get(name)
    if (!descriptor) {
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_STATE,
        `Plugin "${name}" is not installed`,
      )
    }

    try {
      // 触发卸载前钩子
      await this.hooks.call('plugin:beforeUninstall', { name }, { throwOnError: true })

      // 调用插件的卸载方法
      if (descriptor.plugin.uninstall) {
        await descriptor.plugin.uninstall()
      }

      // 清理
      this.clearPluginRegistration(name)

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
   * 销毁宿主
   */
  destroy(): Promise<void> {
    if (this.destruction) return this.destruction
    this.isDestroying = true
    this.destruction = this.operations.then(() => this.disposeHost())
    return this.destruction
  }

  /** 在安装和移除操作结束后，卸载剩余插件并释放宿主资源。 */
  private async disposeHost(): Promise<void> {
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
    if (this.isDestroyed || this.isDestroying) {
      throw new KLineChartError(GENERIC_ERROR_CODES.DISPOSED, 'PluginHost has been destroyed')
    }
  }
}

// 导出工厂函数
export function createPluginHost(logger?: PluginLogger): PluginHostImpl {
  return new PluginHostImpl(logger)
}
