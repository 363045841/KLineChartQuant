import { KLineChartError } from '../../errors'
import type { PluginHost } from '../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../foundation/plugin/stateKeys'

import type {
  IndicatorMetadata,
  IndicatorCategory,
  IndicatorType,
  StateKey,
  RendererFactory,
  ScaleRendererFactory,
  IndicatorConfigUpdater,
  IndicatorRuntimeDescriptor,
  GetTitleInfoFn,
  IndicatorRendererNameResolver,
  IndicatorAuxiliaryRendererNameResolver,
} from './indicatorMetadata'
import { resolveStateKey } from './indicatorMetadata'
import type { ChartDataView } from '../state/modeState'

export type IndicatorDefinitionConfig<T = unknown> = {
  name: string
  aliases?: readonly string[]
  displayName: string
  category: IndicatorCategory
  indicatorType: IndicatorType
  indicatorTypeLabel?: string
  stateKey?: StateKey
  defaultPaneId: string
  /** 指标可参与渲染的数据视图；未声明时仅支持 K 线。 */
  dataViews?: readonly ChartDataView[]
  paneIdField?: string
  allowMainPane?: boolean
  scaleRendererFactory?: ScaleRendererFactory
  scale?: IndicatorMetadata['scale']
  updateConfig?: IndicatorConfigUpdater
  applyResult?: (host: PluginHost, state: unknown, paneId: string) => void
  mainPane?: IndicatorMetadata['mainPane']
  /** 覆盖默认的 renderer plugin 命名规则。 */
  getRendererName?: IndicatorRendererNameResolver
  /** 覆盖默认的副图坐标轴 plugin 命名规则。 */
  getScaleRendererName?: IndicatorAuxiliaryRendererNameResolver
  /** 覆盖默认的副图标题 plugin 命名规则。 */
  getPaneTitleRendererName?: IndicatorAuxiliaryRendererNameResolver
  visibleState?: IndicatorMetadata['visibleState']
  runtime?: IndicatorRuntimeDescriptor
  getTitleInfo?: GetTitleInfoFn
}

type IndicatorDefinitionClass = {
  new (...args: never[]): unknown
  rendererFactory?: RendererFactory
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
 *   static rendererFactory = createMARendererPlugin
 * }
 */
export function Indicator(config: IndicatorDefinitionConfig) {
  return function <T extends IndicatorDefinitionClass>(
    value: T,
    context: ClassDecoratorContext<T>,
  ): T {
    context.addInitializer(function (this: T) {
      const rendererFactory = this.rendererFactory
      if (typeof rendererFactory !== 'function') {
        throw new KLineChartError(
          'INVALID_PARAM',
          `[Indicator] '${config.name}' definition must expose static rendererFactory`,
        )
      }

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

      // 自动生成 stateKey
      const stateKey: StateKey =
        config.stateKey ??
        (config.category === 'main'
          ? createIndicatorStateKey(config.name, 'main')
          : (paneId: string) => createIndicatorStateKey(config.name, paneId))

      // runtime.configKey 默认等于 name
      const runtime = config.runtime && {
        ...config.runtime,
        configKey: config.runtime.configKey ?? config.name,
      }

      // 有 runtime 时自动生成 updateConfig / applyResult
      const updateConfig = runtime
        ? (config.updateConfig ??
          ((scheduler: any, params: any, paneId?: string) => {
            scheduler.updateIndicatorConfig(config.name, params, paneId)
          }))
        : config.updateConfig

      const applyResult = runtime
        ? (config.applyResult ??
          ((host: any, state: any, paneId: string) => {
            host.setSharedState(
              resolveStateKey(stateKey, paneId),
              state as any,
              'indicator_scheduler',
            )
          }))
        : config.applyResult

      indicatorDefinitions.set(normalizedName, {
        ...config,
        getRendererName,
        getScaleRendererName,
        getPaneTitleRendererName,
        stateKey,
        runtime,
        updateConfig,
        applyResult,
        rendererFactory,
        paneIdField: config.paneIdField,
        allowMainPane: config.allowMainPane,
      })
      indexAlias(config.name, normalizedName)
      indexAlias(config.displayName, normalizedName)
      for (const alias of config.aliases ?? []) {
        indexAlias(alias, normalizedName)
      }
    })

    return value
  }
}

export function getRegisteredIndicatorDefinitions(): readonly IndicatorMetadata[] {
  return [...indicatorDefinitions.values()]
}

export function getRegisteredIndicatorDefinition(name: string): IndicatorMetadata | undefined {
  const normalizedName = normalizeIndicatorId(name)
  const canonicalName = indicatorDefinitionAliases.get(normalizedName) ?? normalizedName
  return indicatorDefinitions.get(canonicalName)
}

export function clearRegisteredIndicatorDefinitionsForTest(): void {
  indicatorDefinitions.clear()
  indicatorDefinitionAliases.clear()
}
