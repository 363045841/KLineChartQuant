/**
 * 指标目录投影：把注册表快照映射成界面契约，并提供唯一的目录信号。
 *
 * 目录信号是选择器、公共 API 与 Agent 共用的读取入口；它只依赖注册表修订号，
 * 不维护第二份列表状态。
 */

import type { IndicatorInputDisplay } from '@/engine/indicators/indicatorMetadata.js'
import {
  type IndicatorDescriptor,
  indicatorCatalogRevision,
  readAlertDescriptors,
  readIndicatorDescriptors,
  resolveCanonicalIndicatorId,
  resolveIndicatorDefinitionId,
} from '@/engine/indicators/pipeline/index.js'
import { computed, type ReadonlySignal } from '@/foundation/reactivity/index.js'
import { INDICATOR_ROLE, type IndicatorDefinition, type IndicatorInputDef } from '../../types.js'

/** 参数值只接受标量；其它类型不进入参数面板。 */
function isParamValue(value: unknown): value is number | string | boolean {
  return typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean'
}

/** 有候选值就是下拉，否则按值的运行时类型决定控件。 */
function paramType(
  value: number | string | boolean,
  hasOptions: boolean,
): IndicatorInputDef['type'] {
  if (hasOptions) return 'select'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'string'
}

/** 把声明里的字符串候选补成统一的 value/label 结构。 */
function toOptions(
  input: IndicatorInputDisplay | undefined,
): IndicatorInputDef['options'] | undefined {
  if (input?.options === undefined || input.options.length === 0) return undefined
  return input.options.map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option,
  )
}

/**
 * 把一条参数声明映射成界面契约。
 *
 * @param key 参数键
 * @param value 默认值
 * @param input 展示声明
 * @returns 参数定义；非标量默认值不展示
 */
function toParamDef(
  key: string,
  value: unknown,
  input: IndicatorInputDisplay | undefined,
): IndicatorInputDef | undefined {
  if (!isParamValue(value)) return undefined
  const options = toOptions(input)
  return {
    key,
    label: input?.title ?? key,
    type: paramType(value, options !== undefined),
    default: value,
    min: input?.min,
    max: input?.max,
    step: input?.step,
    ...(options === undefined ? {} : { options }),
  }
}

/** 目录项的参数声明投影；指标与警报共用同一套参数结构。 */
function resolveInputs(descriptor: IndicatorDescriptor): readonly IndicatorInputDef[] {
  const defaults = { ...descriptor.defaultInputs, ...descriptor.defaultOptions }
  return Object.entries(defaults).flatMap(([key, value]) => {
    const input = toParamDef(key, value, descriptor.inputDefs?.[key])
    return input === undefined ? [] : [input]
  })
}

/** 把一个目录项映射成控制器层的指标定义。 */
function toIndicatorDefinition(descriptor: IndicatorDescriptor): IndicatorDefinition {
  return {
    id: resolveCanonicalIndicatorId(descriptor),
    source: descriptor.source,
    label: descriptor.displayName,
    name: descriptor.title === undefined ? descriptor.displayName : descriptor.title,
    description: descriptor.info,
    role: descriptor.category === 'main' ? 'main' : 'sub',
    documentIdentity: descriptor.documentIdentity,
    inputs: resolveInputs(descriptor),
  }
}

/** 警报脚本在选择器中的最小投影；没有渲染位置与角色。 */
export interface AlertScriptDefinition {
  readonly id: string
  readonly label: string
  readonly name: string
  readonly description?: string
  readonly inputs: readonly IndicatorInputDef[]
}

/** 把一个目录项映射成警报脚本定义。 */
function toAlertDefinition(descriptor: IndicatorDescriptor): AlertScriptDefinition {
  return {
    id: resolveCanonicalIndicatorId(descriptor),
    label: descriptor.displayName,
    name: descriptor.title === undefined ? descriptor.displayName : descriptor.title,
    ...(descriptor.info === undefined ? {} : { description: descriptor.info }),
    inputs: resolveInputs(descriptor),
  }
}

/**
 * 指标目录信号：注册表任意增删改后重建。
 *
 * 选择器与公共 API 直接订阅它，不再各自复制一份列表。
 */
export const indicatorCatalog: ReadonlySignal<readonly IndicatorDefinition[]> = computed(() => {
  indicatorCatalogRevision()
  return readIndicatorDescriptors()
    .map(toIndicatorDefinition)
    .sort(
      (a, b) =>
        (a.role === INDICATOR_ROLE.MAIN ? 0 : 1) - (b.role === INDICATOR_ROLE.MAIN ? 0 : 1) ||
        a.label.localeCompare(b.label),
    )
})

/**
 * 警报脚本目录信号：只含 `kind === 'alert'` 的定义。
 *
 * 供警报面板展示。
 */
export const alertCatalog: ReadonlySignal<readonly AlertScriptDefinition[]> = computed(() => {
  indicatorCatalogRevision()
  return readAlertDescriptors()
    .map(toAlertDefinition)
    .sort((left, right) => left.label.localeCompare(right.label))
})

/** 目录中的指标数量与顺序以 `indicatorCatalog` 为准，这里只做名称匹配。 */
function normalizeId(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * 按规范 ID 或展示名查找目录项。
 *
 * @param id 指标 ID 或名称
 * @returns 匹配的定义；未注册时返回 undefined
 */
export function findIndicatorDefinition(id: string): IndicatorDefinition | undefined {
  const normalized = normalizeId(id)
  const catalog = indicatorCatalog()
  const direct = catalog.find(
    (item) => normalizeId(item.id) === normalized || normalizeId(item.label) === normalized,
  )
  if (direct) return direct
  const canonical = resolveIndicatorDefinitionId(id)
  return canonical === undefined
    ? undefined
    : catalog.find((item) => normalizeId(item.id) === normalizeId(canonical))
}
