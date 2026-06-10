import type {
    IndicatorMetadata,
    IndicatorCategory,
    StateKey,
    RendererFactory,
    ScaleRendererFactory,
    IndicatorConfigUpdater,
    IndicatorRuntimeDescriptor,
    GetTitleInfoFn,
} from './indicatorMetadata'
import type { PluginHost } from '../../plugin'
import { createIndicatorStateKey } from '../../plugin/stateKeys'
import { resolveStateKey } from './indicatorMetadata'

export type IndicatorDefinitionConfig<T = unknown> = {
    name: string
    aliases?: readonly string[]
    displayName: string
    category: IndicatorCategory
    stateKey?: StateKey
    defaultPaneId: string
    paneIdField?: string
    allowMainPane?: boolean
    scaleRendererFactory?: ScaleRendererFactory
    scale?: IndicatorMetadata['scale']
    updateConfig?: IndicatorConfigUpdater
    applyResult?: (host: PluginHost, state: unknown, paneId: string) => void
    mainPane?: IndicatorMetadata['mainPane']
    visibleState?: IndicatorMetadata['visibleState']
    runtime?: IndicatorRuntimeDescriptor
    semantic?: IndicatorMetadata<T>['semantic']
    getTitleInfo?: GetTitleInfoFn
}

type IndicatorDefinitionClass = {
    new(...args: never[]): unknown
    rendererFactory?: RendererFactory
}

const indicatorDefinitions = new Map<string, IndicatorMetadata>()
const indicatorDefinitionAliases = new Map<string, string>()

function normalizeIndicatorId(id: string): string {
    return id.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
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
    return function <T extends IndicatorDefinitionClass>(value: T, context: ClassDecoratorContext<T>): T {
        context.addInitializer(function (this: T) {
            const rendererFactory = this.rendererFactory
            if (typeof rendererFactory !== 'function') {
                throw new Error(`[Indicator] '${config.name}' definition must expose static rendererFactory`)
            }

            const normalizedName = normalizeIndicatorId(config.name)
            removeAliasesFor(normalizedName)

            // 自动生成 stateKey
            const stateKey: StateKey = config.stateKey ?? (
                config.category === 'main'
                    ? createIndicatorStateKey(config.name, 'main')
                    : (paneId: string) => createIndicatorStateKey(config.name, paneId)
            )

            // runtime.configKey 默认等于 name
            const runtime = config.runtime && {
                ...config.runtime,
                configKey: config.runtime.configKey ?? config.name,
            }

            // 有 runtime 时自动生成 updateConfig / applyResult
            const updateConfig = runtime
                ? (config.updateConfig ?? ((scheduler: any, params: any, paneId?: string) => {
                    scheduler.updateIndicatorConfig(config.name, params, paneId)
                }))
                : config.updateConfig

            const applyResult = runtime
                ? (config.applyResult ?? ((host: any, state: any, paneId: string) => {
                    host.setSharedState(resolveStateKey(stateKey, paneId), state as any, 'indicator_scheduler')
                }))
                : config.applyResult

            indicatorDefinitions.set(normalizedName, {
                ...config,
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
    return Array.from(indicatorDefinitions.values())
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
