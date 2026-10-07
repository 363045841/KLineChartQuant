/** 指标定义装饰器与全局定义目录，实例挂载由图表状态驱动。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '../../errors.js'
import { makePluginLayerId } from '../../foundation/plugin/impl/rendererLayerId.js'
import type { ChartDataView } from '../chartModel/index.js'
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
  /** 覆盖默认的副图标题 plugin 命名规则。 */
  getPaneTitleRendererName?: IndicatorAuxiliaryRendererNameResolver
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

const definitionMetadata = Symbol('Indicator.definition')
const indicatorDefinitions = new Map<string, IndicatorMetadata>()
const indicatorDefinitionAliases = new Map<string, string>()

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
        const getPaneTitleRendererName: IndicatorAuxiliaryRendererNameResolver =
          config.getPaneTitleRendererName ?? (({ paneId }) => `paneTitle_${paneId}`)

        // runtime.configKey 默认等于 name
        const runtime = config.runtime && {
          ...config.runtime,
          configKey: config.runtime.configKey ?? config.name,
        }

        metadata = {
          ...config,
          getRendererName,
          getScaleRendererName,
          getPaneTitleRendererName,
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

/** 注册注解定义；相同元数据幂等，不同定义争用同一身份时拒绝覆盖。 */
export function registerIndicatorDefinition(definitionClass: IndicatorDefinitionClass): void {
  const definition = definitionClass[definitionMetadata]?.()
  if (!definition) {
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      '[Indicator] definition class must declare @Indicator metadata',
    )
  }
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
  const aliases = [definition.name, definition.displayName, ...(definition.aliases ?? [])]
  for (const alias of aliases) {
    const target = indicatorDefinitionAliases.get(normalizeIndicatorId(alias))
    if (target && target !== normalizedName) {
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        `[Indicator] alias is already registered: '${alias}'`,
      )
    }
  }
  indicatorDefinitions.set(normalizedName, definition)
  for (const alias of aliases) indexAlias(alias, normalizedName)
}

/** 按目录里的唯一命名规则解析数据、坐标轴或标题 Layer ID；未声明的身份直接报错。 */
export function resolveIndicatorLayerId(
  definitionId: string,
  paneId: string,
  part: 'renderer' | 'scale' | 'title' = 'renderer',
): string {
  const definition = getRegisteredIndicatorDefinition(definitionId)
  const options = { paneId, indicatorId: definitionId }
  const name =
    part === 'renderer'
      ? definition?.getRendererName(options)
      : part === 'scale'
        ? definition?.getScaleRendererName(options)
        : definition?.getPaneTitleRendererName(options)
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

/** 按名称、展示名或别名查询已装配定义。 */
export function getRegisteredIndicatorDefinition(name: string): IndicatorMetadata | undefined {
  const normalizedName = normalizeIndicatorId(name)
  const canonicalName = indicatorDefinitionAliases.get(normalizedName) ?? normalizedName
  return indicatorDefinitions.get(canonicalName)
}

/**
 * 将指标的 name / displayName / 别名解析为对外规范 ID（即 displayName）。
 *
 * 规范 ID 是 Core、UI、Agent 共用的唯一指标身份；内部 name 仅用于 renderer 命名与
 * 计算定义解析，不再作为对外标识。未注册时返回 undefined。
 */
export function resolveIndicatorDefinitionId(nameOrAlias: string): string | undefined {
  return getRegisteredIndicatorDefinition(nameOrAlias)?.displayName
}

/** 清空测试目录；类上的声明仍可重新装配。 */
export function clearRegisteredIndicatorDefinitionsForTest(): void {
  indicatorDefinitions.clear()
  indicatorDefinitionAliases.clear()
}
