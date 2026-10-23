/** 指标展示目录从已注册定义及输入声明派生，不维护平行 UI 配置。 */
import { computed } from '@/foundation/reactivity/signal.js'
import { getIndicatorDescriptors, resolveCanonicalIndicatorId, resolveIndicatorDefinitionId } from '../../indicators/indicatorDefinitionRegistry.js'
import { type IndicatorInputDef, IndicatorKind } from '../../indicators/indicatorMetadata.js'

export interface ParamConfig {
  key: string
  label: string
  type: 'number' | 'select' | 'string' | 'boolean'
  min?: number
  max?: number
  step?: number
  default?: number | string | boolean
  options?: ReadonlyArray<{ value: string; label: string }>
  description?: string
  visibleWhen?: { key: string; values: readonly (number | string | boolean)[] }
}

export interface Indicator {
  source?: import('../../indicators/indicatorMetadata.js').IndicatorSource
  id: string
  label: string
  name: string
  pane: 'main' | 'sub'
  description?: string
  params?: ParamConfig[]
}

/** 只用于目录名称匹配，不改变注册身份。 */
function normalizeId(id: string): string { return id.trim().toLowerCase().replace(/[^a-z0-9]/g, '') }

/** 参数类型、范围和默认值直接取定义声明；未命名输入以字段名展示。 */
function parameterConfigs(defaults: Readonly<Record<string, unknown>>, definitions: Readonly<Record<string, IndicatorInputDef>> | undefined): ParamConfig[] {
  return Object.entries(defaults).flatMap(([key, value]): ParamConfig[] => {
    if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean') return []
    const input = definitions?.[key]
    const options = input?.options
    return [{ key, label: input?.title === undefined ? key : input.title,
      type: options && options.length > 0 ? 'select' : typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string',
      default: value, min: input?.min, max: input?.max, step: input?.step,
      ...(options === undefined ? {} : { options: options.map((option) => ({ value: option, label: option })) }),
    }]
  })
}

/** 注册表修订触发重建；所有指标使用同一份元数据来源。 */
const indicatorCatalog = computed<readonly Indicator[]>(() => getIndicatorDescriptors()
  .filter((definition) => definition.kind === IndicatorKind.Indicator)
  .map((definition): Indicator => ({
    id: resolveCanonicalIndicatorId(definition), source: definition.source,
    label: definition.displayName, name: definition.title === undefined ? definition.displayName : definition.title,
    pane: definition.category === 'main' ? 'main' : 'sub', description: definition.info,
    params: parameterConfigs({ ...definition.defaultParams, ...definition.defaultOptions }, definition.inputDefs),
  }))
  .sort((a, b) => (a.pane === 'main' ? 0 : 1) - (b.pane === 'main' ? 0 : 1) || a.label.localeCompare(b.label)))

/** 返回目录快照，调用方不会改写缓存。 */
export function allIndicators(): Indicator[] { return [...indicatorCatalog()] }

/** 按规范身份、展示名或注册别名查找。 */
export function findIndicator(id: string): Indicator | undefined {
  const normalized = normalizeId(id)
  const direct = indicatorCatalog().find((item) => normalizeId(item.id) === normalized || normalizeId(item.label) === normalized)
  if (direct) return direct
  const canonical = resolveIndicatorDefinitionId(id)
  return canonical === undefined ? undefined : indicatorCatalog().find((item) => normalizeId(item.id) === normalizeId(canonical))
}

/** 查询目录中的默认 pane 分类。 */
export function isSubIndicatorId(id: string): boolean { return findIndicator(id)?.pane === 'sub' }
