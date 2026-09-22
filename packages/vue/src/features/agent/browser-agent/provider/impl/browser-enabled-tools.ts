// 用户选择的已启用工具集合；首次使用时保持所有已注册工具启用，内存缓存避免重复读盘。

import type { BrowserAgentModelSettingsStore } from './browser-agent-model-settings.js'

/** 保存用户选择的已启用工具；首次使用时保持所有已注册工具启用，内存缓存避免重复读盘。 */
export class BrowserEnabledTools {
  private cache: Set<string> | undefined

  constructor(private readonly modelSettings: BrowserAgentModelSettingsStore) {}

  read(defaultNames: readonly string[]): Set<string> {
    this.cache ??= this.parse(defaultNames)
    return new Set(this.cache)
  }

  write(names: ReadonlySet<string>): void {
    this.cache = new Set(names)
    this.modelSettings.setEnabledTools(this.cache)
  }

  /** 解析持久化的工具名称；缺失或损坏时回退到全部注册名。 */
  private parse(defaultNames: readonly string[]): Set<string> {
    const names = this.modelSettings.enabledTools()
    return names.length > 0 && names.every((name) => typeof name === 'string')
      ? new Set(names)
      : new Set(defaultNames)
  }
}
