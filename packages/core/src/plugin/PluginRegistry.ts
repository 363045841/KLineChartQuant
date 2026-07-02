/**
 * 插件注册表
 */
import { KLineChartError } from '../errors'

import type { Plugin, PluginDescriptor, PluginState } from './types'

export class PluginRegistry {
  private plugins: Map<string, PluginDescriptor> = new Map()

  /**
   * 注册插件
   */
  register(plugin: Plugin, config?: Record<string, unknown>): PluginDescriptor {
    if (this.plugins.has(plugin.name)) {
      throw new KLineChartError('INVALID_STATE', `Plugin "${plugin.name}" is already registered`)
    }

    const descriptor: PluginDescriptor = {
      plugin,
      config: {
        enabled: true,
        priority: 0,
        ...config,
      },
      state: 'registered' as PluginState,
    }

    this.plugins.set(plugin.name, descriptor)
    return descriptor
  }

  /**
   * 注销插件
   */
  unregister(name: string): boolean {
    return this.plugins.delete(name)
  }

  /**
   * 获取插件描述符
   */
  get(name: string): PluginDescriptor | undefined {
    return this.plugins.get(name)
  }

  /**
   * 获取插件实例
   */
  getPlugin<T extends Plugin = Plugin>(name: string): T | undefined {
    return this.plugins.get(name)?.plugin as T | undefined
  }

  /**
   * 获取所有插件
   */
  getAll(): PluginDescriptor[] {
    return [...this.plugins.values()]
  }

  /**
   * 获取所有已启用的插件
   */
  getEnabled(): PluginDescriptor[] {
    return this.getAll().filter((d) => d.config?.enabled !== false)
  }

  /**
   * 更新插件状态
   */
  updateState(name: string, state: PluginState, error?: Error): void {
    const descriptor = this.plugins.get(name)
    if (descriptor) {
      descriptor.state = state
      if (error) {
        descriptor.error = error
      }
    }
  }

  /**
   * 检查插件是否存在
   */
  has(name: string): boolean {
    return this.plugins.has(name)
  }

  /**
   * 清除所有插件
   */
  clear(): void {
    this.plugins.clear()
  }
}
