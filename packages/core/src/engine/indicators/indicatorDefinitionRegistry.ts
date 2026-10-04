/** 指标定义装饰器与全局定义目录，实例挂载由图表状态驱动。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '../../errors.js'
import type { ChartDataView } from '../state/modeState.js'
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
  /** 指标选择器 UI 元数据：内置指标来自静态 uiMeta 表；外部指标随定义携带。 */
  ui?: { name?: string; description?: string; params?: readonly unknown[] }
}

type IndicatorDefinitionClass = {
  new (...args: never[]): unknown
  rendererFactory?: RendererFactory
  scaleRendererFactory?: ScaleRendererFactory
}

const indicatorDefinitions = new Map<string, IndicatorMetadata>()
const indicatorDefinitionAliases = new Map<string, string>()

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
 * 标准类装饰器：在模块加载时收集指标定义
 *
 * 使用方式：
 * @Indicator({ name: 'ma', ... })
 * class MADefinition {
 *   static rendererFactory = createMALayer
 * }
 */
/** 组装指标元数据并写入注册表：@Indicator 装饰器与编程式注册的共享实现。
 *  外部宿主（插件 bundle）与 Core 不共享模块实例、无法经类装饰器注册，
 *  编程式入口是外部指标定义进入目录的唯一通道。name 放宽为 string：
 *  契约 union 仅约束内置指标的编译期拼写，外部指标运行时无此约束。 */
function defineIndicator<C>(
  config: Omit<IndicatorDefinitionConfig<C>, 'name'> & {
    name: string
    aliases?: readonly string[]
  },
  rendererFactory: RendererFactory,
  classScaleRendererFactory?: ScaleRendererFactory,
): void {
  const normalizedName = normalizeIndicatorId(config.name)
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
  removeAliasesFor(normalizedName)

  // runtime.configKey 默认等于 name
  const runtime = config.runtime && {
    ...config.runtime,
    configKey: config.runtime.configKey ?? config.name,
  }

  indicatorDefinitions.set(normalizedName, {
    ...config,
    getRendererName,
    getScaleRendererName,
    getPaneTitleRendererName,
    runtime,
    rendererFactory,
    scaleRendererFactory: classScaleRendererFactory ?? config.scaleRendererFactory,
    paneIdField: config.paneIdField,
    allowMainPane: config.allowMainPane,
  })
  indexAlias(config.name, normalizedName)
  indexAlias(config.displayName, normalizedName)
  for (const alias of config.aliases ?? []) {
    indexAlias(alias, normalizedName)
  }
}

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

      defineIndicator(config, rendererFactory, this.scaleRendererFactory)
    })

    return value
  }
}

/**
 * 编程式注册指标定义（无装饰器环境用）：外部宿主/插件 bundle 与 Core 不共享
 * 模块实例，类装饰器的模块加载注册不可达；由宿主以本函数直接写入注册表。
 * 同名重复注册抛错（与装饰器语义一致）。
 */
export function registerIndicatorDefinition(
  config: Omit<IndicatorDefinitionConfig, 'name'> & {
    name: string
    aliases?: readonly string[]
  },
  rendererFactory: RendererFactory,
): void {
  if (indicatorDefinitions.has(normalizeIndicatorId(config.name))) {
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      `[Indicator] '${config.name}' is already registered.`,
    )
  }
  defineIndicator(config, rendererFactory)
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
}
