/**
 * 配置管理器
 */

type ConfigStore = Map<string, Map<string, unknown>>

export class ConfigManager {
  private configs: ConfigStore = new Map()
  private defaults: Map<string, Record<string, unknown>> = new Map()

  /**
   * 注册插件的默认配置
   */
  registerDefaults(pluginName: string, defaults: Record<string, unknown>): void {
    this.defaults.set(pluginName, { ...defaults })

    // 初始化配置
    if (!this.configs.has(pluginName)) {
      this.configs.set(pluginName, new Map())
    }

    // 应用默认值
    const config = this.configs.get(pluginName)!
    for (const [key, value] of Object.entries(defaults)) {
      if (!config.has(key)) {
        config.set(key, value)
      }
    }
  }

  /**
   * 获取配置
   */
  get<K = unknown>(pluginName: string, key: string, defaultValue?: K): K {
    const pluginConfig = this.configs.get(pluginName)
    if (pluginConfig?.has(key)) {
      return pluginConfig.get(key) as K
    }

    // 尝试默认值
    const defaults = this.defaults.get(pluginName)
    if (defaults && key in defaults) {
      return defaults[key] as K
    }

    return defaultValue as K
  }

  /**
   * 设置配置
   */
  set(pluginName: string, key: string, value: unknown): void {
    if (!this.configs.has(pluginName)) {
      this.configs.set(pluginName, new Map())
    }
    this.configs.get(pluginName)!.set(key, value)
  }

  /**
   * 批量设置配置
   */
  setAll(pluginName: string, config: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(config)) {
      this.set(pluginName, key, value)
    }
  }

  /**
   * 获取插件所有配置
   */
  getAll(pluginName: string): Record<string, unknown> {
    const config = this.configs.get(pluginName)
    const defaults = this.defaults.get(pluginName) || {}

    return {
      ...defaults,
      ...(config ? Object.fromEntries(config) : {}),
    }
  }

  /**
   * 清除插件配置
   */
  clear(pluginName?: string): void {
    if (pluginName) {
      this.configs.delete(pluginName)
      this.defaults.delete(pluginName)
    } else {
      this.configs.clear()
      this.defaults.clear()
    }
  }
}
