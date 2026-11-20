/**
 * 配置管理器：按插件隔离的键值配置，只保留读写与清理。
 */

type ConfigStore = Map<string, Map<string, unknown>>

export class ConfigManager {
  private configs: ConfigStore = new Map()

  /**
   * 获取配置；未设置时返回调用方给出的默认值。
   */
  get<K = unknown>(pluginName: string, key: string, defaultValue?: K): K {
    const pluginConfig = this.configs.get(pluginName)
    return pluginConfig?.has(key) ? (pluginConfig.get(key) as K) : (defaultValue as K)
  }

  /**
   * 设置单个配置项。
   */
  set(pluginName: string, key: string, value: unknown): void {
    if (!this.configs.has(pluginName)) {
      this.configs.set(pluginName, new Map())
    }
    this.configs.get(pluginName)!.set(key, value)
  }

  /**
   * 批量设置配置项。
   */
  setAll(pluginName: string, config: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(config)) {
      this.set(pluginName, key, value)
    }
  }

  /**
   * 清除指定插件或全部插件配置。
   */
  clear(pluginName?: string): void {
    if (pluginName) {
      this.configs.delete(pluginName)
    } else {
      this.configs.clear()
    }
  }
}
