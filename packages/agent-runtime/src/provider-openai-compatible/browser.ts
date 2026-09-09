// 浏览器端 OpenAI-compatible 模型目录请求，避免由宿主进程代发。
import { AgentRuntimeError } from '../contracts/errors.js'
import { normalizeProviderBaseUrl, parseProviderErrorDetails, providerHttpError } from './http.js'
import { parseProviderModelCatalog, providerModelView } from './model-catalog.js'

import type { ProviderModelsInput, ProviderModelsResult } from '../contracts/ui.js'

/**
 * 直接请求 Provider 模型目录并转换为稳定的 UI 模型视图。
 *
 * @param input 模型目录请求参数。
 * @param fetchImplementation 浏览器或宿主提供的 fetch 实现。
 * @returns 可供界面选择的模型列表及刷新时间。
 * @throws {AgentRuntimeError} Provider 返回失败状态或无效模型目录时抛出。
 */
export async function fetchOpenAiCompatibleModels(
  input: ProviderModelsInput,
  fetchImplementation: typeof fetch = globalThis.fetch,
): Promise<ProviderModelsResult> {
  const baseUrl = normalizeProviderBaseUrl(input.baseUrl)
  const apiKey = input.apiKey?.trim()
  const response = await fetchImplementation(`${baseUrl}/models`, {
    headers: {
      ...input.headers,
      Accept: 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
  })
  if (!response.ok) {
    throw providerHttpError(
      response.status,
      undefined,
      parseProviderErrorDetails(await response.text()),
    )
  }
  const payload = (await response.json().catch(() => undefined)) as unknown
  try {
    return { models: parseProviderModelCatalog(payload).map(providerModelView), refreshedAt: Date.now() }
  } catch {
    throw new AgentRuntimeError(
      'PROVIDER_MALFORMED_RESPONSE',
      'The Provider returned an invalid model catalog.',
    )
  }
}
