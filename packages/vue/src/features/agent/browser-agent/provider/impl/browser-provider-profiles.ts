// 浏览器端唯一 Provider 配置数组的内存真相源；内存优先，写入时同步持久化。

import type { BrowserProviderProfile } from '../types.js'
import type { BrowserAgentModelSettingsStore } from './browser-agent-model-settings.js'

/** 管理浏览器端唯一的 Provider 配置数组；内存优先，写入时同步持久化。 */
export class BrowserProviderProfiles {
  private cache: BrowserProviderProfile[] | undefined

  constructor(private readonly modelSettings: BrowserAgentModelSettingsStore) {}

  read(): BrowserProviderProfile[] {
    return this.models().map((profile) => ({ ...profile }))
  }

  write(profiles: BrowserProviderProfile[]): void {
    this.cache = profiles.map((profile) => ({ ...profile }))
    this.modelSettings.setProfiles(this.cache)
  }

  active(): BrowserProviderProfile | undefined {
    return this.models().find((profile) => profile.active)
  }

  select(name: string): void {
    this.write(this.models().map((profile) => ({ ...profile, active: profile.name === name })))
  }

  /** 重命名配置，保持其激活状态与其余配置不变。 */
  rename(previousName: string, nextName: string): void {
    this.write(
      this.models().map((profile) =>
        profile.name === previousName ? { ...profile, name: nextName } : profile,
      ),
    )
  }

  /** 移除配置；若移除的是激活配置，则将剩余配置中的第一个设为激活。 */
  remove(name: string): void {
    const remaining = this.models().filter((profile) => profile.name !== name)
    const keepsActive = remaining.some((profile) => profile.active)
    this.write(
      keepsActive
        ? remaining
        : remaining.map((profile, index) => ({ ...profile, active: index === 0 })),
    )
  }

  updateActive(patch: Partial<Omit<BrowserProviderProfile, 'name' | 'active'>>): void {
    this.write(
      this.models().map((profile) => (profile.active ? { ...profile, ...patch } : profile)),
    )
  }

  /** 惰性载入持久化的配置数组，之后作为唯一内存真相源。 */
  private models(): readonly BrowserProviderProfile[] {
    this.cache ??= this.load()
    return this.cache
  }

  /** 从模型设置文档载入配置数组。 */
  private load(): BrowserProviderProfile[] {
    return this.modelSettings.profiles()
  }
}
