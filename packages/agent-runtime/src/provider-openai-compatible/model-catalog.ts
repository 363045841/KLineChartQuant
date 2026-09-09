// OpenAI-compatible 模型目录的能力解析与展示转换。
import {
  PROVIDER_REASONING_EFFORTS,
  type ProviderModelView,
  type ProviderReasoningEffort,
} from '../contracts/ui.js'

const MAX_CATALOG_MODELS = 2_000
const MAX_MODEL_ID_LENGTH = 256

/** 已校验的 Provider 模型能力，供连接测试和运行计划共享。 */
export interface ProviderCatalogModel {
  id: string
  name: string
  contextWindow?: number
  maxOutputTokens?: number
  reasoningEfforts: readonly ProviderReasoningEffort[]
  defaultReasoningEffort?: ProviderReasoningEffort
}

/** 判断未知值是否为普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 提取合法的正整数能力值。 */
function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

/** 解析模型声明的思考强度。 */
function reasoningCapabilities(value: unknown): Pick<
  ProviderCatalogModel,
  'reasoningEfforts' | 'defaultReasoningEffort'
> {
  if (!isRecord(value) || !Array.isArray(value.supported_efforts)) {
    return { reasoningEfforts: [] }
  }
  const supportedEfforts = value.supported_efforts
  const reasoningEfforts = PROVIDER_REASONING_EFFORTS.filter((effort) => supportedEfforts.includes(effort))
  const defaultReasoningEffort =
    typeof value.default_effort === 'string' && reasoningEfforts.includes(value.default_effort as ProviderReasoningEffort)
      ? (value.default_effort as ProviderReasoningEffort)
      : undefined
  return { reasoningEfforts, defaultReasoningEffort }
}

/** 校验 Provider `/models` 响应并保留模型运行能力。 */
export function parseProviderModelCatalog(value: unknown): ProviderCatalogModel[] {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw new TypeError('The Provider returned an invalid model catalog.')
  }
  const unique = new Map<string, ProviderCatalogModel>()
  for (const item of value.data) {
    if (!isRecord(item) || typeof item.id !== 'string') continue
    const id = item.id.trim()
    if (!id || id.length > MAX_MODEL_ID_LENGTH) continue
    const rawName = typeof item.name === 'string' ? item.name.trim() : ''
    const topProvider = isRecord(item.top_provider) ? item.top_provider : undefined
    unique.set(id, {
      id,
      name: rawName.slice(0, MAX_MODEL_ID_LENGTH) || id,
      contextWindow:
        positiveInteger(topProvider?.context_length) ?? positiveInteger(item.context_length),
      maxOutputTokens: positiveInteger(topProvider?.max_completion_tokens),
      ...reasoningCapabilities(item.reasoning),
    })
    if (unique.size >= MAX_CATALOG_MODELS) break
  }
  if (unique.size === 0) throw new TypeError('The Provider returned an empty model catalog.')
  return [...unique.values()].sort((left, right) => left.id.localeCompare(right.id))
}

/** 将已校验的目录模型转换为稳定 UI 视图。 */
export function providerModelView(model: ProviderCatalogModel): ProviderModelView {
  return {
    id: model.id,
    name: model.name,
    compatibility: 'unknown',
    ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
    ...(model.maxOutputTokens ? { maxOutputTokens: model.maxOutputTokens } : {}),
    ...(model.reasoningEfforts.length ? { reasoningEfforts: model.reasoningEfforts } : {}),
    ...(model.defaultReasoningEffort
      ? { defaultReasoningEffort: model.defaultReasoningEffort }
      : {}),
  }
}
