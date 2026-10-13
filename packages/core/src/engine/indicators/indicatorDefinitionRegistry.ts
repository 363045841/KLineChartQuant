/**
 * 全局指标定义目录，实例挂载由图表状态驱动。
 *
 * 目录分两层：静态目录（IndicatorDescriptor，编译期提取，读取不加载实现）供选择器、
 * 别名解析与 Agent 工具结构同步使用；实现目录（IndicatorMetadata）只含已加载的定义，
 * 由 loadIndicatorDefinitions 按需填充。
 */
import { GENERIC_ERROR_CODES, KLineChartError } from '../../errors.js'
import { createSignal } from '../../foundation/reactivity/signal.js'
import type { ChartDataView } from '../chartModel/index.js'
import { BUILTIN_INDICATOR_MANIFEST } from './generated/builtinIndicators.js'
import type { IndicatorName } from './indicatorContracts.js'
import { definitionMetadata, type IndicatorDefinitionClass } from './indicatorDecorator.js'
import {
  clearIndicatorLayerNamingForTest,
  normalizeIndicatorId,
  registerIndicatorLayerNaming,
} from './indicatorLayerNaming.js'
import type {
  IndicatorCategory,
  IndicatorInputDef,
  IndicatorKind,
  IndicatorMetadata,
  IndicatorType,
} from './indicatorMetadata.js'

/** 装饰器与定义配置由叶子模块提供，此处转出以维持公开出口。 */
export type { IndicatorDefinitionClass, IndicatorDefinitionConfig } from './indicatorDecorator.js'
export { Indicator } from './indicatorDecorator.js'
export { resolveIndicatorLayerId } from './indicatorLayerNaming.js'

/**
 * 静态目录项：选择器、搜索与 Agent 工具结构需要的全部字段，读取时不加载指标实现。
 * 内置定义由生成器在编译期从 @Indicator 声明提取。
 */
export interface IndicatorDescriptor {
  readonly source?: IndicatorMetadata['source']
  readonly name: IndicatorName
  readonly kind: IndicatorKind
  readonly aliases?: readonly string[]
  readonly displayName: string
  readonly category: IndicatorCategory
  readonly indicatorType: IndicatorType
  readonly indicatorTypeLabel?: string
  readonly defaultPaneId: string
  readonly dataViews?: readonly ChartDataView[]
  readonly allowMainPane?: boolean
  /** runtime.defaultParams 的静态值。 */
  readonly defaultParams?: Readonly<Record<string, unknown>>
  /** runtime.inputDefs 的静态值；只含展示声明，默认值仍在 defaultParams。 */
  readonly inputDefs?: Readonly<Record<string, IndicatorInputDef>>
  /** presentation.defaultOptions 的静态值。 */
  readonly defaultOptions?: Readonly<Record<string, unknown>>
}

/** 按需加载实现的入口；第三方直接注册的定义没有加载入口。 */
export type IndicatorDefinitionLoader = () => Promise<IndicatorDefinitionClass>

const indicatorDefinitions = new Map<string, IndicatorMetadata>()
const indicatorDescriptors = new Map<
  string,
  { readonly descriptor: IndicatorDescriptor; readonly load?: IndicatorDefinitionLoader }
>()
const indicatorDefinitionAliases = new Map<string, string>()
const pendingDefinitionLoads = new Map<string, Promise<void>>()
/** 定义变更意图，执行器据此区分新增与替换。 */
export interface IndicatorDefinitionChange {
  readonly type: 'create' | 'update' | 'remove'
  readonly definition: IndicatorMetadata
}

const definitionListeners = new Set<(change: IndicatorDefinitionChange) => void>()
const catalogRevision = createSignal(0)
let builtinCatalogRegistered = false

/** 将已校验的非空别名写入目录索引。 */
function indexAlias(alias: string, name: string): void {
  const normalized = normalizeIndicatorId(alias)
  if (normalized) {
    indicatorDefinitionAliases.set(normalized, name)
  }
}

/** 目录身份的全部查询键：内部名、展示名与别名。 */
function identityAliases(
  descriptor: Pick<IndicatorDescriptor, 'name' | 'displayName' | 'aliases'>,
) {
  return [descriptor.name, descriptor.displayName, ...(descriptor.aliases ?? [])]
}

/** 校验全部别名可归属到该身份，避免失败后目录留下部分写入。 */
function assertAliasesAvailable(aliases: ReadonlyArray<string>, normalizedName: string): void {
  for (const alias of aliases) {
    const target = indicatorDefinitionAliases.get(normalizeIndicatorId(alias))
    if (target && target !== normalizedName) {
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        `[Indicator] alias is already registered: '${alias}'`,
      )
    }
  }
}

/** 首次读取目录时登记内置静态目录；只写目录，不加载任何实现。 */
function ensureBuiltinCatalog(): void {
  if (builtinCatalogRegistered) return
  builtinCatalogRegistered = true
  for (const entry of BUILTIN_INDICATOR_MANIFEST) {
    registerIndicatorDescriptor(entry.descriptor, entry.load)
  }
}

/**
 * 登记静态目录项及其按需加载入口；同名重复登记保持首次结果。
 * 别名与已有身份冲突时拒绝写入。
 */
export function registerIndicatorDescriptor(
  descriptor: IndicatorDescriptor,
  load?: IndicatorDefinitionLoader,
): void {
  const normalizedName = normalizeIndicatorId(descriptor.name)
  if (!normalizedName) {
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      '[Indicator] descriptor name must not be empty',
    )
  }
  if (indicatorDescriptors.has(normalizedName)) return
  const aliases = identityAliases(descriptor)
  assertAliasesAvailable(aliases, normalizedName)
  indicatorDescriptors.set(normalizedName, { descriptor, load })
  catalogRevision.set(catalogRevision.peek() + 1)
  for (const alias of aliases) indexAlias(alias, normalizedName)
}

/** 从已装配元数据派生静态目录项，供第三方直接注册的定义进入选择器。 */
function descriptorFromMetadata(definition: IndicatorMetadata): IndicatorDescriptor {
  const defaultParams = definition.runtime?.defaultParams
  return {
    name: definition.name,
    source: definition.source,
    kind: definition.kind,
    aliases: definition.aliases,
    displayName: definition.displayName,
    category: definition.category,
    indicatorType: definition.indicatorType,
    indicatorTypeLabel: definition.indicatorTypeLabel,
    defaultPaneId: definition.defaultPaneId,
    dataViews: definition.dataViews,
    allowMainPane: definition.allowMainPane,
    defaultParams:
      typeof defaultParams === 'function'
        ? (defaultParams as () => Record<string, unknown>)()
        : (defaultParams as Readonly<Record<string, unknown>> | undefined),
    defaultOptions: definition.presentation?.defaultOptions,
    inputDefs: definition.runtime?.inputDefs,
  }
}

/** 注册注解定义；相同元数据幂等，不同定义争用同一身份时拒绝覆盖。 */
export function registerIndicatorDefinition(definitionClass: IndicatorDefinitionClass): void {
  const definition = definitionClass[definitionMetadata]?.()
  if (!definition) {
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      '[Indicator] definition class must declare @Indicator metadata',
    )
  }
  ensureBuiltinCatalog()
  const normalizedName = normalizeIndicatorId(definition.name)
  const existing = indicatorDefinitions.get(normalizedName)
  if (existing === definition) return
  if (!normalizedName || existing) {
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      `[Indicator] definition name is empty or already registered: '${definition.name}'`,
    )
  }
  publishDefinition(definition, false)
}

/** 显式替换已有脚本实现；注册仍拒绝重复身份，原生定义不允许被脚本编辑覆盖。 */
export function updateIndicatorDefinition(definitionClass: IndicatorDefinitionClass): void {
  const definition = definitionClass[definitionMetadata]?.()
  const existing = definition && getRegisteredIndicatorDefinition(definition.name)
  if (
    !definition ||
    !existing ||
    definition.source !== 'script' ||
    existing.source !== 'script' ||
    definition.name !== existing.name ||
    JSON.stringify(identityAliases(definition)) !== JSON.stringify(identityAliases(existing))
  ) {
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      '[Indicator] only existing script definitions with unchanged identity can be updated',
    )
  }
  publishDefinition(definition, true)
}

/** 校验后统一发布完整定义快照，静态目录与执行器订阅者同时接收新元数据。 */
function publishDefinition(definition: IndicatorMetadata, replaceDescriptor: boolean): void {
  const normalizedName = normalizeIndicatorId(definition.name)
  const aliases = identityAliases(definition)
  assertAliasesAvailable(aliases, normalizedName)
  indicatorDefinitions.set(normalizedName, definition)
  if (replaceDescriptor || !indicatorDescriptors.has(normalizedName)) {
    indicatorDescriptors.set(normalizedName, { descriptor: descriptorFromMetadata(definition) })
  }
  for (const alias of aliases) indexAlias(alias, normalizedName)
  registerIndicatorLayerNaming(aliases, definition.getRendererName, definition.getScaleRendererName)
  // 先推进目录修订号再通知消费者：订阅者重建目录时才能看到本次提交。
  catalogRevision.set(catalogRevision.peek() + 1)
  notifyDefinition({ type: replaceDescriptor ? 'update' : 'create', definition })
}

/** 删除脚本文档及目录身份，通知所有图表移除对应实例。 */
export function removeScriptIndicatorDefinition(id: string): void {
  const definition = getRegisteredIndicatorDefinition(id)
  if (!definition?.document || definition.source !== 'script') {
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      '[Indicator] script document not found',
    )
  }
  const key = normalizeIndicatorId(definition.name)
  indicatorDefinitions.delete(key)
  indicatorDescriptors.delete(key)
  for (const alias of identityAliases(definition))
    indicatorDefinitionAliases.delete(normalizeIndicatorId(alias))
  // 删除同样先推进修订号，订阅者才能感知目录已变化。
  catalogRevision.set(catalogRevision.peek() + 1)
  notifyDefinition({ type: 'remove', definition })
}

/** 已提交快照的通知独立于写入，单个消费者失败不能阻断其它消费者。 */
function notifyDefinition(change: IndicatorDefinitionChange): void {
  for (const listener of [...definitionListeners]) {
    // 已提交定义不因某个消费者失败而回滚；其它图表仍须收到同一快照。
    try {
      listener(change)
    } catch (error) {
      console.error('[Indicator] definition consumer failed', error)
    }
  }
}

/** 订阅定义新增与更新事件；返回取消订阅函数。 */
export function onIndicatorDefinitionChanged(
  listener: (change: IndicatorDefinitionChange) => void,
): () => void {
  definitionListeners.add(listener)
  return () => definitionListeners.delete(listener)
}

/** 将名称、展示名或别名解析为目录统一键；未知身份返回 undefined。 */
function resolveCatalogKey(nameOrAlias: string): string | undefined {
  ensureBuiltinCatalog()
  const normalized = normalizeIndicatorId(nameOrAlias)
  const key = indicatorDefinitionAliases.get(normalized) ?? normalized
  return indicatorDescriptors.has(key) || indicatorDefinitions.has(key) ? key : undefined
}

/** 返回全部静态目录项（内置 + 已注册的第三方定义），不加载实现。 */
export function getIndicatorDescriptors(): readonly IndicatorDescriptor[] {
  ensureBuiltinCatalog()
  // 读取修订号建立响应式依赖：定义增删改时，依赖本目录的派生视图会自动重建。
  catalogRevision()
  return [...indicatorDescriptors.values()].map((entry) => entry.descriptor)
}

/** 按名称、展示名或别名查询静态目录项，不加载实现。 */
export function getIndicatorDescriptor(nameOrAlias: string): IndicatorDescriptor | undefined {
  catalogRevision()
  const key = resolveCatalogKey(nameOrAlias)
  return key === undefined ? undefined : indicatorDescriptors.get(key)?.descriptor
}

/** 查询某定义的实现是否已装配。 */
export function isIndicatorDefinitionLoaded(nameOrAlias: string): boolean {
  return getRegisteredIndicatorDefinition(nameOrAlias) !== undefined
}

/** 装配单个目录项的实现；并发请求共享同一加载任务，失败后可重试。 */
function loadCatalogEntry(key: string): Promise<void> {
  if (indicatorDefinitions.has(key)) return Promise.resolve()
  const pending = pendingDefinitionLoads.get(key)
  if (pending) return pending
  const load = indicatorDescriptors.get(key)?.load
  if (!load) return Promise.resolve()
  const task = load()
    .then((definitionClass) => {
      if (!indicatorDefinitions.has(key)) registerIndicatorDefinition(definitionClass)
    })
    .finally(() => pendingDefinitionLoads.delete(key))
  pendingDefinitionLoads.set(key, task)
  return task
}

/**
 * 按需加载指定定义的实现（每个定义一个模块），已加载与未知身份直接跳过。
 * @param namesOrAliases 名称、展示名或别名
 */
export async function loadIndicatorDefinitions(namesOrAliases: Iterable<string>): Promise<void> {
  const keys = new Set<string>()
  for (const id of namesOrAliases) {
    const key = resolveCatalogKey(id)
    if (key !== undefined) keys.add(key)
  }
  await Promise.all([...keys].map(loadCatalogEntry))
}

/** 加载全部已登记目录项的实现。 */
export function loadAllIndicatorDefinitions(): Promise<void> {
  ensureBuiltinCatalog()
  return loadIndicatorDefinitions([...indicatorDescriptors.keys()])
}

/** 返回已装配定义的快照，调用方不能修改目录。 */
export function getRegisteredIndicatorDefinitions(): readonly IndicatorMetadata[] {
  return [...indicatorDefinitions.values()]
}

/** 按名称、展示名或别名查询已装配定义；未加载实现时返回 undefined。 */
export function getRegisteredIndicatorDefinition(name: string): IndicatorMetadata | undefined {
  const key = resolveCatalogKey(name)
  return key === undefined ? undefined : indicatorDefinitions.get(key)
}

/**
 * 将指标的 name / displayName / 别名解析为对外规范 ID（即 displayName）。
 *
 * 规范 ID 是 Core、UI、Agent 共用的唯一指标身份；内部 name 仅用于 renderer 命名与
 * 计算定义解析，不再作为对外标识。未注册时返回 undefined。
 */
export function resolveIndicatorDefinitionId(nameOrAlias: string): string | undefined {
  return getIndicatorDescriptor(nameOrAlias)?.displayName
}

/** 清空测试目录；类上的声明仍可重新装配，内置静态目录在下次读取时重新登记。 */
export function clearRegisteredIndicatorDefinitionsForTest(): void {
  indicatorDefinitions.clear()
  indicatorDescriptors.clear()
  indicatorDefinitionAliases.clear()
  pendingDefinitionLoads.clear()
  clearIndicatorLayerNamingForTest()
  builtinCatalogRegistered = false
  // 清空本身也是一次目录变更，推进修订号让派生视图失效。
  catalogRevision.set(catalogRevision.peek() + 1)
}
