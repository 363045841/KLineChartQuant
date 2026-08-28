// 浏览器端 OpenAI-compatible 模型目录请求，避免由宿主进程代发。
import { AgentRuntimeError } from '../contracts/errors.js'
import { normalizeProviderBaseUrl, providerHttpError } from './http.js'

import type { ProviderModelsInput, ProviderModelsResult } from '../contracts/ui.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 直接请求 Provider 模型目录并转换为稳定的 UI 模型视图。
export async function fetchOpenAiCompatibleModels(
  input: ProviderModelsInput,
  fetchImplementation: typeof fetch = globalThis.fetch,
): Promise<ProviderModelsResult> {
  const baseUrl = normalizeProviderBaseUrl(input.baseUrl)
  const apiKey = input.apiKey?.trim()
  const response = await fetchImplementation(`${baseUrl}/models`, {
    headers: {
      Accept: 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
  })
  if (!response.ok) throw providerHttpError(response.status)
  const payload = (await response.json().catch(() => undefined)) as unknown
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new AgentRuntimeError(
      'PROVIDER_MALFORMED_RESPONSE',
      'The Provider returned an invalid model catalog.',
    )
  }
  const models = payload.data.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim()) return []
    const id = item.id.trim()
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : id
    return [{ id, name, compatibility: 'unknown' as const }]
  })
  if (models.length === 0) {
    throw new AgentRuntimeError(
      'PROVIDER_MALFORMED_RESPONSE',
      'The Provider returned an empty model catalog.',
    )
  }
  return { models, refreshedAt: Date.now() }
}
