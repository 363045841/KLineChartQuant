/**
 * 指标定义装饰器与全局定义目录，实例挂载由图表状态驱动。
 *
 * 目录分两层：静态目录（IndicatorDescriptor，编译期提取，读取不加载实现）供选择器、
 * 别名解析与 Agent 工具结构同步使用；实现目录（IndicatorMetadata）只含已加载的定义，
 * 由 loadIndicatorDefinitions 按需填充。
 */
import { GENERIC_ERROR_CODES, KLineChartError } from '../../errors.js'
import { makePluginLayerId } from '../../foundation/plugin/impl/rendererLayerId.js'
import type { ChartDataView } from '../chartModel/index.js'
import { BUILTIN_INDICATOR_MANIFEST } from './generated/builtinIndicators.js'
import type { IndicatorName } from './indicatorContracts.js'
import type {
  GetTitleInfoFn,
  IndicatorAuxiliaryRendererNameResolver,
  IndicatorCategory,
  IndicatorKind,
  IndicatorMetadata,
  IndicatorPresentationDescriptor,
  IndicatorRendererNameResolver,
  IndicatorRuntimeDescriptor,
  IndicatorType,
  RendererFactory,
  ScaleRendererFactory,
} from './indicatorMetadata.js'

export type IndicatorDefinitionConfig<T = unknown> = {
  /** 指标定义名称，允许第三方扩展；注册定义后仍须添加指标实例。 */
  name: IndicatorName
  aliases?: readonly string[]
  displayName: string
  /** 定义身份：系统渲染器或用户可添加的指标。所有定义必须显式声明。 */
  kind: IndicatorKind
  category: IndicatorCategory
  indicatorType: IndicatorType
  indicatorTypeLabel?: string
  defaultPaneId: string
  /** 指标可参与渲染的数据视图；未声明时仅支持 K 线。 */
  dataViews?: readonly ChartDataView[]
  paneIdField?: string
  allowMainPane?: boolean
  scaleRendererFactory?: ScaleRendererFactory
  scale?: IndicatorMetadata['scale']
  mainPane?: IndicatorMetadata['mainPane']
  /** 覆盖默认的 renderer plugin 命名规则。 */
  getRendererName?: IndicatorRendererNameResolver
  /** 覆盖默认的副图坐标轴 plugin 命名规则。 */
  getScaleRendererName?: IndicatorAuxiliaryRendererNameResolver
  visibleState?: IndicatorMetadata['visibleState']
  runtime?: IndicatorRuntimeDescriptor<T>
  presentation?: IndicatorPresentationDescriptor
  getTitleInfo?: GetTitleInfoFn
}

export type IndicatorDefinitionClass = {
  new (...args: never[]): unknown
  rendererFactory?: RendererFactory
  scaleRendererFactory?: ScaleRendererFactory
  [definitionMetadata]?: () => IndicatorMetadata
}

/**
 * 静态目录项：选择器、搜索与 Agent 工具结构需要的全部字段，读取时不加载指标实现。
 * 内置定义由生成器在编译期从 @Indicator 声明提取。
 */
export interface IndicatorDescriptor {
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
  /** presentation.defaultOptions 的静态值。 */
  readonly defaultOptions?: Readonly<Record<string, unknown>>
}

/** 按需加载实现的入口；第三方直接注册的定义没有加载入口。 */
export type IndicatorDefinitionLoader = () => Promise<IndicatorDefinitionClass>

const definitionMetadata = Symbol('Indicator.definition')
const indicatorDefinitions = new Map<string, IndicatorMetadata>()
const indicatorDescriptors = new Map<
  string,
  { readonly descriptor: IndicatorDescriptor; readonly load?: IndicatorDefinitionLoader }
>()
const indicatorDefinitionAliases = new Map<string, string>()
const pendingDefinitionLoads = new Map<string, Promise<void>>()
const registrationListeners = new Set<(definition: IndicatorMetadata) => void>()
let builtinCatalogRegistered = false

/** 将名称和别名转换为目录使用的统一查询键。 */
function normalizeIndicatorId(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** 将已校验的非空别名写入目录索引。 */
function indexAlias(alias: string, name: string): void {
  const normalized = normalizeIndicatorId(alias)
  if (normalized) {
    indicatorDefinitionAliases.set(normalized, name)
  }
}

/**
 * 标准类装饰器：只声明元数据，类初始化不修改全局目录；装配入口负责注册。
 *
 * 使用方式：
 * @Indicator({ name: 'ma', ... })
 * class MADefinition {
 *   static rendererFactory = createMALayer
 * }
 */
export function Indicator<C>(config: IndicatorDefinitionConfig<C>) {
  return function <T extends IndicatorDefinitionClass>(
    value: T,
    _context: ClassDecoratorContext<T>,
  ): T {
    let metadata: IndicatorMetadata | undefined
    Object.defineProperty(value, definitionMetadata, {
      value: () => {
        if (metadata) return metadata
        const rendererFactory = value.rendererFactory
        if (typeof rendererFactory !== 'function') {
          throw new KLineChartError(
            GENERIC_ERROR_CODES.INVALID_PARAM,
            `[Indicator] '${config.name}' definition must expose static rendererFactory`,
          )
        }

        // 固定主图定义使用独占名称；可切换 pane 的定义使用 pane 级身份。
        const getRendererName: IndicatorRendererNameResolver =
          config.getRendererName ??
          (({ paneId }) =>
            config.category === 'main' && !config.allowMainPane && paneId === 'main'
              ? config.name
              : `${config.name}_${paneId}`)
        const getScaleRendererName: IndicatorAuxiliaryRendererNameResolver =
          config.getScaleRendererName ??
          (({ paneId }) =>
            value.scaleRendererFactory || config.scaleRendererFactory || config.scale
              ? `${config.scale?.indicatorKey ?? config.name}Scale_${paneId}`
              : null)

        // runtime.configKey 默认等于 name
        const runtime = config.runtime && {
          ...config.runtime,
          configKey: config.runtime.configKey ?? config.name,
        }

        metadata = {
          ...config,
          getRendererName,
          getScaleRendererName,
          runtime,
          rendererFactory,
          scaleRendererFactory: value.scaleRendererFactory ?? config.scaleRendererFactory,
          paneIdField: config.paneIdField,
          allowMainPane: config.allowMainPane,
        }
        return metadata
      },
    })

    return value
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
  for (const alias of aliases) indexAlias(alias, normalizedName)
}

/** 从已装配元数据派生静态目录项，供第三方直接注册的定义进入选择器。 */
function descriptorFromMetadata(definition: IndicatorMetadata): IndicatorDescriptor {
  const defaultParams = definition.runtime?.defaultParams
  return {
    name: definition.name,
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
  // 先校验全部别名，避免失败后目录留下部分写入。
  const aliases = identityAliases(definition)
  assertAliasesAvailable(aliases, normalizedName)
  indicatorDefinitions.set(normalizedName, definition)
  if (!indicatorDescriptors.has(normalizedName)) {
    indicatorDescriptors.set(normalizedName, { descriptor: descriptorFromMetadata(definition) })
  }
  for (const alias of aliases) indexAlias(alias, normalizedName)
  for (const listener of [...registrationListeners]) listener(definition)
}

/** 订阅实现装配事件；返回取消订阅函数。 */
export function onIndicatorDefinitionRegistered(
  listener: (definition: IndicatorMetadata) => void,
): () => void {
  registrationListeners.add(listener)
  return () => registrationListeners.delete(listener)
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
  return [...indicatorDescriptors.values()].map((entry) => entry.descriptor)
}

/** 按名称、展示名或别名查询静态目录项，不加载实现。 */
export function getIndicatorDescriptor(nameOrAlias: string): IndicatorDescriptor | undefined {
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

/** 按目录里的唯一命名规则解析数据或坐标轴 Layer ID。 */
export function resolveIndicatorLayerId(
  definitionId: string,
  paneId: string,
  part: 'renderer' | 'scale' = 'renderer',
): string {
  const definition = getRegisteredIndicatorDefinition(definitionId)
  const options = { paneId, indicatorId: definitionId }
  const name =
    part === 'renderer'
      ? definition?.getRendererName(options)
      : definition?.getScaleRendererName(options)
  if (!name)
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      `[Indicator] missing ${part} identity for '${definitionId}'`,
    )
  return makePluginLayerId(name)
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
  builtinCatalogRegistered = false
}
