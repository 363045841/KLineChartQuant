// OpenAI-compatible Provider 的内存存储实现，供测试与非持久化宿主使用。

import type { ProviderCredentialStore } from '../contracts/credentials.js'
import type { OpenAiCompatibleProviderSettings, ProviderSettingsStore } from './types.js'

/** 用于测试或非持久化宿主的 API Key 内存存储。 */
export class InMemoryProviderCredentialStore implements ProviderCredentialStore {
  private key: string | undefined

  /**
   * 读取当前内存中的 API Key。
   * @param signal 用于在读取前取消操作的信号。
   * @returns API Key；未写入时返回 undefined。
   */
  async read(signal?: AbortSignal): Promise<string | undefined> {
    signal?.throwIfAborted()
    return this.key
  }

  /**
   * 将 API Key 保存至内存。
   * @param apiKey 待保存的 API Key。
   * @param signal 用于在写入前取消操作的信号。
   */
  async write(apiKey: string, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    this.key = apiKey
  }

  /**
   * 清除内存中的 API Key。
   * @param signal 用于在删除前取消操作的信号。
   */
  async delete(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    this.key = undefined
  }
}

/** 用于测试或非持久化宿主的 Provider 设置内存存储。 */
export class InMemoryProviderSettingsStore implements ProviderSettingsStore {
  private value: OpenAiCompatibleProviderSettings | undefined

  /**
   * 读取设置的独立副本，避免调用方修改内部状态。
   * @param signal 用于在读取前取消操作的信号。
   * @returns 设置副本；未写入时返回 undefined。
   */
  async read(signal?: AbortSignal): Promise<OpenAiCompatibleProviderSettings | undefined> {
    signal?.throwIfAborted()
    return this.value ? structuredClone(this.value) : undefined
  }

  /**
   * 保存设置的独立副本，隔离调用方后续修改。
   * @param settings 待保存的已验证设置。
   * @param signal 用于在写入前取消操作的信号。
   */
  async write(settings: OpenAiCompatibleProviderSettings, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    this.value = structuredClone(settings)
  }
}
