/**
 * 指标仓库：定义表、静态目录表、别名索引与懒加载任务的唯一持有者。
 *
 * 写入只经过 registerIndicators / unregisterIndicator：一次调用完成全部表写入，
 * 并只发出一次变更通知。读取方拿到的永远是同一份已提交快照。
 */

import {
  clearIndicatorLayerNamingForTest,
  normalizeIndicatorId,
  registerIndicatorLayerNaming,
} from '@/engine/indicators/indicatorLayerNaming.js'
import type { IndicatorMetadata } from '@/engine/indicators/indicatorMetadata.js'
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import { batch, createSignal } from '@/foundation/reactivity/signal.js'
import type {
  IndicatorCatalogCommit,
  IndicatorCatalogCommitSignal,
  IndicatorCatalogRevision,
  IndicatorDefinitionLoader,
  IndicatorDescriptor,
  IndicatorFailure,
  IndicatorFailureSignal,
  IndicatorPipelineReport,
  RegistrableIndicator,
} from '../types.js'

interface DescriptorEntry {
  readonly descriptor: IndicatorDescriptor
  readonly load?: IndicatorDefinitionLoader
  readonly origin: RegistrableIndicator['candidate']['origin']
}

const definitions = new Map<string, IndicatorMetadata>()
const descriptors = new Map<string, DescriptorEntry>()
const aliases = new Map<string, string>()
const pendingLoads = new Map<string, Promise<void>>()

const revision = createSignal(0)
const commitSignal = createSignal<IndicatorCatalogCommit | null>(null)
const failures = createSignal<readonly IndicatorFailure[]>([])

/** 注册表修订号；任意增删改都推进，读取方据此建立失效依赖。 */
export const indicatorCatalogRevision: IndicatorCatalogRevision = revision
/** 最近一次提交的变更摘要；增量消费者只订阅它。 */
export const indicatorCommits: IndicatorCatalogCommitSignal = commitSignal
/** 最近一次管线运行登记的失败清单，供界面展示“哪条脚本在哪个阶段失败”。 */
export const indicatorFailures: IndicatorFailureSignal = failures

/** 覆盖失败清单；只有管线编排与注册阶段调用。 */
export function setIndicatorFailures(list: readonly IndicatorFailure[]): void {
  failures.set(Object.freeze([...list]))
}

/** 目录身份的全部查询键：内部名、展示名与别名。 */
function identityAliases(
  descriptor: Pick<IndicatorDescriptor, 'name' | 'displayName' | 'aliases'>,
): string[] {
  return [descriptor.name, descriptor.displayName, ...(descriptor.aliases ?? [])]
}

/** 校验全部别名可归属到该身份，避免失败后目录留下部分写入。 */
function assertAliasesAvailable(names: readonly string[], key: string): void {
  for (const name of names) {
    const target = aliases.get(normalizeIndicatorId(name))
    if (target && target !== key) {
      throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, `指标身份已被占用：${name}`)
    }
  }
}

/** 从已装配元数据派生静态目录项，供选择器与搜索读取。 */
function descriptorFromMetadata(definition: IndicatorMetadata): IndicatorDescriptor {
  const defaultParams = definition.runtime?.defaultParams
  return {
    name: definition.name,
    source: definition.source,
    aliases: definition.aliases,
    displayName: definition.displayName,
    title: definition.title,
    info: definition.info,
    category: definition.category,
    defaultPaneId: definition.defaultPaneId,
    dataViews: definition.dataViews,
    visiblePeriods: definition.visiblePeriods,
    defaultParams:
      typeof defaultParams === 'function'
        ? (defaultParams as () => Record<string, unknown>)()
        : (defaultParams as Readonly<Record<string, unknown>> | undefined),
    defaultOptions: definition.presentation?.defaultOptions,
    inputDefs: definition.runtime?.inputDefs,
    documentIdentity: definition.document?.identity,
  }
}

/** 只保留有值的目录字段，供静态目录与实现元数据合并。 */
function definedDescriptor(descriptor: IndicatorDescriptor): IndicatorDescriptor {
  const entries = Object.entries(descriptor).filter(([, value]) => value !== undefined)
  return Object.fromEntries(entries) as IndicatorDescriptor
}

/** 本地校验通过后的写入计划；校验失败不留任何部分写入。 */
interface WritePlan {
  readonly key: string
  readonly metadata?: IndicatorMetadata
  readonly descriptor: IndicatorDescriptor
  readonly load?: IndicatorDefinitionLoader
  readonly origin: RegistrableIndicator['candidate']['origin']
  readonly replaced: IndicatorMetadata | undefined
  /** false 表示该身份已是同一状态：不写表、不进入变更通知。 */
  readonly changed: boolean
}

/** 校验一条目录项；已存在的同名目录项按幂等计划返回。 */
function planDescriptorWrite(
  item: Extract<RegistrableIndicator, { kind: 'descriptor' }>,
): WritePlan {
  const key = normalizeIndicatorId(item.descriptor.name)
  if (!key) {
    throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, '指标目录项缺少名称')
  }
  const existing = descriptors.get(key)
  if (existing) {
    return {
      key,
      descriptor: existing.descriptor,
      load: existing.load,
      origin: existing.origin,
      replaced: definitions.get(key),
      changed: false,
    }
  }
  assertAliasesAvailable(identityAliases(item.descriptor), key)
  return {
    key,
    descriptor: item.descriptor,
    load: item.load,
    origin: item.candidate.origin,
    replaced: definitions.get(key),
    changed: true,
  }
}

/**
 * 内置脚本重复注册：源码一致视为幂等，源码不一致拒绝覆盖。
 *
 * 页面里可能有多个工作台共用全局注册表，重复注册是正常路径而不是错误。
 */
function planBuiltinRepeat(
  previous: IndicatorMetadata,
  metadata: IndicatorMetadata,
  key: string,
  origin: RegistrableIndicator['candidate']['origin'],
): WritePlan {
  const incoming = metadata.document
  if (incoming?.identity === 'builtin' && incoming.source === previous.document?.source) {
    return {
      key,
      metadata: previous,
      descriptor: descriptorFromMetadata(previous),
      origin,
      replaced: previous,
      changed: false,
    }
  }
  throw new KLineChartError(
    GENERIC_ERROR_CODES.INVALID_PARAM,
    `内置脚本只读，不能覆盖：${metadata.name}`,
  )
}

/** 校验一条完整定义；只有脚本定义允许替换，内置脚本与原生定义只读。 */
function planDefinitionWrite(
  item: Extract<RegistrableIndicator, { kind: 'definition' }>,
): WritePlan {
  const metadata = item.definition
  const key = normalizeIndicatorId(metadata.name)
  if (!key) {
    throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, '指标定义缺少名称')
  }
  const previous = definitions.get(key)
  if (previous && previous !== metadata) {
    if (previous.source !== 'script') {
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        `指标定义已存在：${metadata.name}`,
      )
    }
    if (previous.document?.identity === 'builtin') {
      return planBuiltinRepeat(previous, metadata, key, item.candidate.origin)
    }
  }
  assertAliasesAvailable(identityAliases(metadata), key)
  return {
    key,
    metadata,
    descriptor: descriptorFromMetadata(metadata),
    origin: item.candidate.origin,
    replaced: previous,
    // 同一份元数据重复装配是幂等操作，不产生新的提交。
    changed: previous !== metadata,
  }
}

/** 把一条可注册项校验成写入计划；冲突或非法身份抛错，由调用方转成失败记录。 */
function planWrite(item: RegistrableIndicator): WritePlan {
  return item.kind === 'descriptor' ? planDescriptorWrite(item) : planDefinitionWrite(item)
}

/** 删除不再归属新定义的旧身份键，避免旧展示名残留成幽灵别名。 */
function purgeStaleAliases(previous: IndicatorMetadata, metadata: IndicatorMetadata): void {
  const nextKeys = new Set(identityAliases(metadata).map(normalizeIndicatorId))
  for (const stale of identityAliases(previous)) {
    const staleKey = normalizeIndicatorId(stale)
    if (staleKey && !nextKeys.has(staleKey)) aliases.delete(staleKey)
  }
}

/** 替换时整份替换；首次装配时保留静态字段并并入运行期元数据。 */
function nextDescriptor(plan: WritePlan): IndicatorDescriptor {
  if (plan.replaced) return plan.descriptor
  const stored = descriptors.get(plan.key)
  return stored === undefined
    ? plan.descriptor
    : { ...stored.descriptor, ...definedDescriptor(plan.descriptor) }
}

/** 应用一条定义计划：实现表、静态目录与渲染命名。 */
function applyDefinitionWrite(plan: WritePlan, metadata: IndicatorMetadata): void {
  if (plan.replaced) purgeStaleAliases(plan.replaced, metadata)
  definitions.set(plan.key, metadata)
  descriptors.set(plan.key, { descriptor: nextDescriptor(plan), origin: plan.origin })
  registerIndicatorLayerNaming(
    identityAliases(metadata),
    metadata.getRendererName,
    metadata.getScaleRendererName,
  )
}

/** 应用一条目录项计划；同名目录项已存在时保持原样。 */
function applyDescriptorWrite(plan: WritePlan): void {
  if (descriptors.has(plan.key)) return
  descriptors.set(plan.key, {
    descriptor: plan.descriptor,
    load: plan.load,
    origin: plan.origin,
  })
}

/** 写入该目录项的全部查询键。 */
function indexAliases(key: string, descriptor: IndicatorDescriptor): void {
  for (const name of identityAliases(descriptor)) {
    const normalized = normalizeIndicatorId(name)
    if (normalized) aliases.set(normalized, key)
  }
}

/** 应用一条写入计划：定义表、静态目录、别名与渲染命名。 */
function applyWrite(plan: WritePlan): void {
  if (plan.metadata) applyDefinitionWrite(plan, plan.metadata)
  else applyDescriptorWrite(plan)
  indexAliases(plan.key, plan.descriptor)
}

/** 逐条校验；单条失败只记录，其它条目继续。 */
function planItems(items: readonly RegistrableIndicator[]): {
  readonly plans: WritePlan[]
  readonly failures: IndicatorFailure[]
} {
  const plans: WritePlan[] = []
  const failures: IndicatorFailure[] = []
  for (const item of items) {
    try {
      plans.push(planWrite(item))
    } catch (error) {
      const name = item.kind === 'definition' ? item.definition.name : item.descriptor.name
      failures.push({
        stage: 'register',
        origin: item.candidate.origin,
        key: item.candidate.key,
        name,
        error,
      })
    }
  }
  return { plans, failures }
}

/** 写入全部变更并发出一次提交；没有实际变化时不推进修订号。 */
function commitPlans(
  plans: readonly WritePlan[],
  failures: readonly IndicatorFailure[],
): IndicatorPipelineReport {
  const committed = plans.map((plan) => plan.descriptor)
  const writes = plans.filter((plan) => plan.changed)
  if (writes.length === 0) return { committed, failures }

  const added: IndicatorMetadata[] = []
  const updated: IndicatorMetadata[] = []
  const described: IndicatorDescriptor[] = []
  for (const plan of writes) {
    const existed = definitions.has(plan.key)
    applyWrite(plan)
    if (plan.metadata) (existed ? updated : added).push(plan.metadata)
    else described.push(plan.descriptor)
  }

  const nextRevision = revision.peek() + 1
  batch(() => {
    revision.set(nextRevision)
    commitSignal.set(
      Object.freeze({ revision: nextRevision, added, updated, removed: [], described }),
    )
  })
  return { committed, failures }
}

/**
 * 注册阶段唯一写入口：一次校验、一次写入、一次通知。
 *
 * 单条失败只记录在返回结果里，其余条目照常提交。
 *
 * @param items 编译阶段产出的可注册项
 * @returns 已提交目录项与逐条失败
 */
export function registerIndicators(
  items: readonly RegistrableIndicator[],
): IndicatorPipelineReport {
  const { plans, failures } = planItems(items)
  if (plans.length === 0) return { committed: [], failures }
  return commitPlans(plans, failures)
}

/**
 * 移除一个用户脚本定义；内置脚本与不存在的身份直接拒绝。
 *
 * 与注册共用同一套表与通知，保证删除也是一次原子提交。
 */
export function unregisterIndicator(id: string): void {
  const key = resolveKey(id)
  if (key === undefined) {
    throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, `脚本指标不存在：${id}`)
  }
  const metadata = definitions.get(key)
  if (!metadata?.document || metadata.source !== 'script') {
    throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, `脚本指标不存在：${id}`)
  }
  if (metadata.document.identity === 'builtin') {
    throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, '内置脚本只读，不能删除')
  }
  definitions.delete(key)
  descriptors.delete(key)
  for (const name of identityAliases(metadata)) {
    aliases.delete(normalizeIndicatorId(name))
  }
  const nextRevision = revision.peek() + 1
  batch(() => {
    revision.set(nextRevision)
    commitSignal.set(
      Object.freeze({
        revision: nextRevision,
        added: [],
        updated: [],
        removed: [metadata],
        described: [],
      }),
    )
  })
}

/** 将名称、展示名或别名解析为目录统一键；未知身份返回 undefined。 */
function resolveKey(nameOrAlias: string): string | undefined {
  const normalized = normalizeIndicatorId(nameOrAlias)
  const key = aliases.get(normalized) ?? normalized
  return descriptors.has(key) || definitions.has(key) ? key : undefined
}

/** 返回全部静态目录项快照（内置 + 脚本 + 第三方）；实现保持懒加载。 */
export function readIndicatorDescriptors(): readonly IndicatorDescriptor[] {
  revision()
  return [...descriptors.values()].map((entry) => entry.descriptor)
}

/** 返回已装配定义的快照，调用方不能修改目录。 */
export function readRegisteredDefinitions(): readonly IndicatorMetadata[] {
  revision()
  return [...definitions.values()]
}

/** 按名称、展示名或别名查询静态目录项；实现保持懒加载。 */
export function getIndicatorDescriptor(nameOrAlias: string): IndicatorDescriptor | undefined {
  revision()
  const key = resolveKey(nameOrAlias)
  return key === undefined ? undefined : descriptors.get(key)?.descriptor
}

/** 按名称、展示名或别名查询已装配定义；实现仍处于懒加载时返回 undefined。 */
export function getRegisteredIndicatorDefinition(name: string): IndicatorMetadata | undefined {
  revision()
  const key = resolveKey(name)
  return key === undefined ? undefined : definitions.get(key)
}

/** 查询某定义的实现是否已装配。 */
export function isIndicatorDefinitionLoaded(nameOrAlias: string): boolean {
  return getRegisteredIndicatorDefinition(nameOrAlias) !== undefined
}

/** 装配单个目录项的实现；并发请求共享同一加载任务，失败后可重试。 */
function loadEntry(key: string): Promise<void> {
  if (definitions.has(key)) return Promise.resolve()
  const pending = pendingLoads.get(key)
  if (pending) return pending
  const entry = descriptors.get(key)
  if (!entry) {
    return Promise.reject(
      new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, `指标目录项不存在：${key}`),
    )
  }
  if (!entry.load) return Promise.resolve()
  const task = entry
    .load()
    .then((definitionClass) => {
      if (definitions.has(key)) return
      registerIndicators([
        {
          kind: 'definition',
          candidate: { key, origin: entry.origin, identity: 'native' },
          definition: definitionClass,
        },
      ])
    })
    .catch((error: unknown) => {
      // 懒加载失败不改变目录项，调用方仍需收到异常；这里只负责留下可检索的日志。
      console.error(`[Indicator] 懒加载实现失败：${entry.descriptor.displayName}（${key}）`, error)
      throw error
    })
    .finally(() => pendingLoads.delete(key))
  pendingLoads.set(key, task)
  return task
}

/**
 * 懒加载指定定义的实现（每个定义一个模块），已加载与未知身份直接跳过。
 * @param namesOrAliases 名称、展示名或别名
 */
export async function loadIndicatorDefinitions(namesOrAliases: Iterable<string>): Promise<void> {
  const keys = new Set<string>()
  for (const id of namesOrAliases) {
    const key = resolveKey(id)
    if (key !== undefined) keys.add(key)
  }
  await Promise.all([...keys].map(loadEntry))
}

/** 加载全部已登记目录项的实现。 */
export function loadAllIndicatorDefinitions(): Promise<void> {
  return loadIndicatorDefinitions([...descriptors.keys()])
}

/**
 * 目录项的对外规范 ID：脚本定义以稳定内部 name 为身份，展示名可编辑；
 * 原生与内置定义沿用 displayName，保持既有对外契约。
 */
export function resolveCanonicalIndicatorId(
  descriptor: Pick<IndicatorDescriptor, 'name' | 'displayName' | 'source'>,
): string {
  return descriptor.source === 'script' ? descriptor.name : descriptor.displayName
}

/**
 * 将指标的 name / displayName / 别名解析为对外规范 ID。
 *
 * @param nameOrAlias 名称、展示名或别名
 * @returns 规范 ID；未注册时返回 undefined
 */
export function resolveIndicatorDefinitionId(nameOrAlias: string): string | undefined {
  const descriptor = getIndicatorDescriptor(nameOrAlias)
  return descriptor === undefined ? undefined : resolveCanonicalIndicatorId(descriptor)
}

/** 清空测试目录、命名规则和失败记录；系统图层不属于指标注册表。 */
export function clearIndicatorStoreForTest(): void {
  definitions.clear()
  descriptors.clear()
  aliases.clear()
  pendingLoads.clear()
  clearIndicatorLayerNamingForTest()
  setIndicatorFailures([])
  const nextRevision = revision.peek() + 1
  commitSignal.set(null)
  revision.set(nextRevision)
}
