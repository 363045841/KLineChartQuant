// OpenAI-compatible Provider 设置的校验与内存存储实现。
import { AgentRuntimeError } from '../contracts/errors.js'

import {
  PROVIDER_SETTINGS_VERSION,
  type OpenAiCompatibleProviderSettings,
  type ProviderCredentialStore,
  type ProviderSettingsStore,
} from './types.js'

/** 判断未知值是否为普通对象，供持久化数据的运行时校验使用。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 校验并规范化已持久化的 Provider 设置。
 *
 * @param value 待校验的未知持久化值。
 * @returns 合法设置；未配置时返回 undefined。
 * @throws {AgentRuntimeError} 设置结构或版本不合法时抛出。
 */
export function parseOpenAiCompatibleProviderSettings(
  value: unknown,
): OpenAiCompatibleProviderSettings | undefined {
  if (value === undefined) return undefined
  if (
    !isRecord(value) ||
    value.version !== PROVIDER_SETTINGS_VERSION ||
    typeof value.baseUrl !== 'string' ||
    typeof value.modelId !== 'string' ||
    typeof value.modelName !== 'string' ||
    value.compatibility !== 'compatible' ||
    typeof value.lastTestedAt !== 'number' ||
    !Number.isFinite(value.lastTestedAt) ||
    typeof value.lastModelsRefreshAt !== 'number' ||
    !Number.isFinite(value.lastModelsRefreshAt)
  ) {
    throw new AgentRuntimeError('PROVIDER_ERROR', 'The saved Provider settings are invalid.', {
      recommendedAction: 'Test the Provider connection again.',
    })
  }
  return {
    version: PROVIDER_SETTINGS_VERSION,
    baseUrl: value.baseUrl,
    modelId: value.modelId,
    modelName: value.modelName,
    compatibility: value.compatibility,
    lastTestedAt: value.lastTestedAt,
    lastModelsRefreshAt: value.lastModelsRefreshAt,
  }
}

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
