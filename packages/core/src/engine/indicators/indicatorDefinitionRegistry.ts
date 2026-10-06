/** 指标定义装饰器与全局定义目录，实例挂载由图表状态驱动。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '../../errors.js'
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
}

const indicatorDefinitions = new Map<string, IndicatorMetadata>()
const indicatorDefinitionAliases = new Map<string, string>()
const declaredDefinitions = new WeakMap<IndicatorDefinitionClass, IndicatorMetadata>()
let registeredClasses = new WeakSet<IndicatorDefinitionClass>()

function normalizeIndicatorId(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function indexAlias(alias: string, name: string): void {
  const normalized = normalizeIndicatorId(alias)
  if (normalized) {
    indicatorDefinitionAliases.set(normalized, name)
  }
}

function removeAliasesFor(name: string): void {
  for (const [alias, target] of indicatorDefinitionAliases) {
    if (target === name) {
      indicatorDefinitionAliases.delete(alias)
    }
  }
}

/**
 * 标准类装饰器：保存元数据并自动注册；生成入口引用定义类以保证生产构建保留初始化。
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
    context: ClassDecoratorContext<T>,
  ): T {
    context.addInitializer(function (this: T) {
      const rendererFactory = this.rendererFactory
      if (typeof rendererFactory !== 'function') {
        throw new KLineChartError(
          GENERIC_ERROR_CODES.INVALID_PARAM,
          `[Indicator] '${config.name}' definition must expose static rendererFactory`,
        )
      }

      const getRendererName: IndicatorRendererNameResolver =
        config.getRendererName ??
        (({ paneId }) => config.mainPane?.rendererName ?? `${config.name}_${paneId}`)
      const getScaleRendererName: IndicatorAuxiliaryRendererNameResolver =
        config.getScaleRendererName ??
        (({ paneId }) =>
          config.scaleRendererFactory || config.scale
            ? `${config.scale?.indicatorKey ?? config.name}Scale_${paneId}`
            : null)
      const getPaneTitleRendererName: IndicatorAuxiliaryRendererNameResolver =
        config.getPaneTitleRendererName ?? (({ paneId }) => `paneTitle_${paneId}`)

      // runtime.configKey 默认等于 name
      const runtime = config.runtime && {
        ...config.runtime,
        configKey: config.runtime.configKey ?? config.name,
      }

      declaredDefinitions.set(this, {
        ...config,
        getRendererName,
        getScaleRendererName,
        getPaneTitleRendererName,
        runtime,
        rendererFactory,
        scaleRendererFactory: this.scaleRendererFactory ?? config.scaleRendererFactory,
        paneIdField: config.paneIdField,
        allowMainPane: config.allowMainPane,
      })
      registerIndicatorDefinition(this)
    })

    return value
  }
}

/** 显式注册带 @Indicator 的定义类；同一类只注册一次，避免多图表初始化覆盖扩展定义。 */
export function registerIndicatorDefinition(definitionClass: IndicatorDefinitionClass): void {
  if (registeredClasses.has(definitionClass)) return
  const definition = declaredDefinitions.get(definitionClass)
  if (!definition) {
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      '[Indicator] definition class must declare @Indicator metadata',
    )
  }
  const normalizedName = normalizeIndicatorId(definition.name)
  removeAliasesFor(normalizedName)
  indicatorDefinitions.set(normalizedName, definition)
  indexAlias(definition.name, normalizedName)
  indexAlias(definition.displayName, normalizedName)
  for (const alias of definition.aliases ?? []) {
    indexAlias(alias, normalizedName)
  }
  registeredClasses.add(definitionClass)
}

export function getRegisteredIndicatorDefinitions(): readonly IndicatorMetadata[] {
  return [...indicatorDefinitions.values()]
}

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

export function clearRegisteredIndicatorDefinitionsForTest(): void {
  indicatorDefinitions.clear()
  indicatorDefinitionAliases.clear()
  registeredClasses = new WeakSet<IndicatorDefinitionClass>()
}
