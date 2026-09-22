// Provider 凭据与非敏感设置存储：把 Runtime 的存储边界适配到浏览器 Profile 数组。

import type {
  OpenAiCompatibleProviderSettings,
  ProviderCredentialStore,
  ProviderSettingsStore,
} from '@363045841yyt/klinechart-agent-runtime'
import type { BrowserProviderProfiles } from './browser-provider-profiles.js'

/** 默认凭据存储：API Key 保存在当前激活 Profile 的 apiKey 字段（Web 端写回 LocalStorage）。 */
export class BrowserProviderCredentialStore implements ProviderCredentialStore {
  constructor(private readonly profiles: BrowserProviderProfiles) {}

  async read(signal?: AbortSignal): Promise<string | undefined> {
    signal?.throwIfAborted()
    return this.profiles.active()?.apiKey || undefined
  }

  async write(apiKey: string, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    this.profiles.updateActive({ apiKey })
  }

  async delete(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    this.profiles.updateActive({ apiKey: '' })
  }
}

/** 默认设置存储：已验证连接与模型能力写入当前激活 Profile。 */
export class BrowserProviderSettingsStore implements ProviderSettingsStore {
  constructor(private readonly profiles: BrowserProviderProfiles) {}

  async read(signal?: AbortSignal): Promise<OpenAiCompatibleProviderSettings | undefined> {
    signal?.throwIfAborted()
    return this.profiles.active()?.settings
  }

  async write(settings: OpenAiCompatibleProviderSettings, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    this.profiles.updateActive({
      settings,
      connection: {
        baseUrl: settings.baseUrl,
        headers: settings.headers,
        protocol: settings.protocol,
      },
    })
  }
}
