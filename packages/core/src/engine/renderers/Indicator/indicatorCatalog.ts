/** 指标展示目录从已注册定义及输入声明派生，不维护平行 UI 配置。 */
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
  /** 脚本身份：内置只读或用户可编辑；原生指标没有该字段。 */
  documentIdentity?: 'builtin' | 'user'
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
      ...(options === undefined
        ? {}
        : {
            options: options.map((option) =>
              typeof option === 'string' ? { value: option, label: option } : option,
            ),
          }),
    }]
  })
}

/**
 * 目录快照：每次调用都读注册表当前值。
 *
 * 不缓存为 computed：脚本定义在运行时陆续注册，缓存过的派生值在没有订阅者时不会失效，
 * 选择器就会停在启动那一刻的列表上。
 */
export function allIndicators(): Indicator[] {
  return getIndicatorDescriptors()
    .filter((definition) => definition.kind === IndicatorKind.Indicator)
    .map((definition): Indicator => ({
      id: resolveCanonicalIndicatorId(definition), source: definition.source,
      label: definition.displayName, name: definition.title === undefined ? definition.displayName : definition.title,
      pane: definition.category === 'main' ? 'main' : 'sub', description: definition.info,
      documentIdentity: definition.documentIdentity,
      params: parameterConfigs({ ...definition.defaultParams, ...definition.defaultOptions }, definition.inputDefs),
    }))
    .sort((a, b) => (a.pane === 'main' ? 0 : 1) - (b.pane === 'main' ? 0 : 1) || a.label.localeCompare(b.label))
}

/** 按规范身份、展示名或注册别名查找。 */
export function findIndicator(id: string): Indicator | undefined {
  const normalized = normalizeId(id)
  const catalog = allIndicators()
  const direct = catalog.find((item) => normalizeId(item.id) === normalized || normalizeId(item.label) === normalized)
  if (direct) return direct
  const canonical = resolveIndicatorDefinitionId(id)
  return canonical === undefined ? undefined : catalog.find((item) => normalizeId(item.id) === normalizeId(canonical))
}

/** 查询目录中的默认 pane 分类。 */
export function isSubIndicatorId(id: string): boolean { return findIndicator(id)?.pane === 'sub' }
