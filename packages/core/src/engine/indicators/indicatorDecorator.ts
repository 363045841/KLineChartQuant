/**
 * 指标定义装饰器：只声明元数据，不读写全局目录，装配由注册表负责。
 *
 * 独立成叶子模块，使指标实现依赖「装饰器」而不是「注册表」，避免
 * 「注册表 → 生成的目录 → 指标实现 → 注册表」形成循环依赖。
 */
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

/** 定义类上挂载元数据读取函数的私有符号；装饰器写入，注册表读取。 */
export const definitionMetadata = Symbol('Indicator.definition')

/** @Indicator 装饰器的定义配置。 */
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

/** 经 @Indicator 装饰的定义类形状。 */
export type IndicatorDefinitionClass = {
  new (...args: never[]): unknown
  rendererFactory?: RendererFactory
  scaleRendererFactory?: ScaleRendererFactory
  [definitionMetadata]?: () => IndicatorMetadata
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
