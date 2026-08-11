/**
 * 统一行情 Provider 注册表与运行时数据源配置。
 * 注册表不负责持久化，应用层可将配置快照同步到 localStorage 或其他存储。
 */

import { KLineChartError } from '../../errors'

import type {
  AssetClass,
  KLineAdjustment,
  KLinePeriod,
  MarketDataProvider,
  SourceCapabilities,
} from './types'

/** 单个行情数据源的运行时配置。 */
export interface MarketDataSourceConfig {
  enabled: boolean
  priority: number
  baseUrl?: string
}

/** 数据源配置的局部更新。 */
export type MarketDataSourceConfigPatch = Partial<MarketDataSourceConfig>

/** 规范化可选 Base URL，空值表示清除覆盖。 */
function normalizeBaseUrl(baseUrl: string | undefined): string | undefined {
  const normalized = baseUrl?.trim().replace(/\/+$/, '')
  return normalized || undefined
}

/** 将局部配置合并为可安全暴露的完整快照。 */
function mergeConfig(
  current: MarketDataSourceConfig,
  patch: MarketDataSourceConfigPatch,
): MarketDataSourceConfig {
  const enabled = patch.enabled ?? current.enabled
  const priority = patch.priority ?? current.priority
  const baseUrl = Object.prototype.hasOwnProperty.call(patch, 'baseUrl')
    ? normalizeBaseUrl(patch.baseUrl)
    : current.baseUrl
  return baseUrl === undefined ? { enabled, priority } : { enabled, priority, baseUrl }
}

/** 源级能力筛选条件。 */
export interface SourceCapabilityQuery {
  capability: 'bars' | 'timeShare' | 'depth'
  assetClass?: AssetClass
  period?: KLinePeriod
  adjustment?: KLineAdjustment
}

/** 判断源级能力是否满足一次请求的候选条件。 */
function supportsCapability(
  capabilities: SourceCapabilities | undefined,
  query: SourceCapabilityQuery,
): boolean {
  if (!capabilities) return false
  if (query.assetClass !== undefined && !capabilities.assetClasses.includes(query.assetClass)) {
    return false
  }
  if (query.capability === 'timeShare') return capabilities.timeShare === true
  if (query.capability === 'depth') return capabilities.depth === true
  const bars = capabilities.bars
  if (!bars) return false
  if (query.period !== undefined && !bars.periods.includes(query.period)) return false
  if (query.adjustment !== undefined && !bars.adjustments.includes(query.adjustment)) return false
  return true
}

/** 管理 Provider 实例及其启用状态和 Transport 地址。 */
export class MarketDataProviderRegistry {
  private readonly providers = new Map<string, MarketDataProvider>()
  private readonly configs = new Map<string, MarketDataSourceConfig>()

  /** 注册 Provider；source ID 必须非空且不得重复。 */
  register(provider: MarketDataProvider, config: MarketDataSourceConfigPatch = {}): void {
    const sourceId = provider.source.id
    if (!sourceId || sourceId !== sourceId.trim()) {
      throw new KLineChartError(
        'INVALID_PARAM',
        '[MarketDataProviderRegistry] source.id must be non-empty and trimmed',
      )
    }
    if (this.providers.has(sourceId)) {
      throw new KLineChartError(
        'INVALID_STATE',
        `[MarketDataProviderRegistry] source "${sourceId}" is already registered`,
      )
    }

    this.providers.set(sourceId, provider)
    this.configs.set(sourceId, mergeConfig({ enabled: true, priority: 0 }, config))
  }

  /** 注销 Provider 及其运行时配置，并返回是否实际删除。 */
  unregister(sourceId: string): boolean {
    const removed = this.providers.delete(sourceId)
    this.configs.delete(sourceId)
    return removed
  }

  /** 按 source ID 查询 Provider。 */
  get(sourceId: string): MarketDataProvider | undefined {
    return this.providers.get(sourceId)
  }

  /** 按 source ID 查询 Provider；未注册时抛出稳定错误。 */
  getRequired(sourceId: string): MarketDataProvider {
    const provider = this.providers.get(sourceId)
    if (!provider) {
      throw new KLineChartError(
        'NOT_REGISTERED',
        `[MarketDataProviderRegistry] source "${sourceId}" is not registered`,
      )
    }
    return provider
  }

  /** 返回全部 Provider，顺序与注册顺序一致。 */
  getAll(): ReadonlyArray<MarketDataProvider> {
    return [...this.providers.values()]
  }

  /** 返回当前启用的 Provider，顺序与注册顺序一致。 */
  getEnabled(): ReadonlyArray<MarketDataProvider> {
    return this.getAll().filter(
      (provider) => this.configs.get(provider.source.id)?.enabled === true,
    )
  }

  /** 返回按 priority 从高到低排列的已启用 Provider。 */
  getEnabledByPriority(): ReadonlyArray<MarketDataProvider> {
    return [...this.getEnabled()].sort(
      (left, right) =>
        (this.configs.get(right.source.id)?.priority ?? 0) -
        (this.configs.get(left.source.id)?.priority ?? 0),
    )
  }

  /** 返回当前声明能力满足条件的已启用 Provider。 */
  getEnabledByCapability(query: SourceCapabilityQuery): ReadonlyArray<MarketDataProvider> {
    return this.getEnabledByPriority().filter((provider) =>
      supportsCapability(this.getCapabilities(provider.source.id), query),
    )
  }

  /** 保存 Provider 最近一次探测得到的源级能力。 */
  setCapabilities(sourceId: string, capabilities: SourceCapabilities | undefined): void {
    const provider = this.getRequired(sourceId)
    if (capabilities === undefined) {
      provider.source.capabilities = undefined
      return
    }
    provider.source.capabilities = capabilities
  }

  /** 读取 Provider 当前源级能力声明。 */
  getCapabilities(sourceId: string): SourceCapabilities | undefined {
    return this.getRequired(sourceId).source.capabilities
  }

  /** 读取数据源配置副本，避免调用方绕过注册表直接修改。 */
  getConfig(sourceId: string): MarketDataSourceConfig {
    this.getRequired(sourceId)
    return { ...this.configs.get(sourceId)! }
  }

  /** 合并数据源运行时配置并返回最新副本。 */
  setConfig(sourceId: string, patch: MarketDataSourceConfigPatch): MarketDataSourceConfig {
    this.getRequired(sourceId)
    const next = mergeConfig(this.configs.get(sourceId)!, patch)
    this.configs.set(sourceId, next)
    return { ...next }
  }

  /** 清空全部 Provider 和配置，供应用销毁或测试隔离使用。 */
  clear(): void {
    this.providers.clear()
    this.configs.clear()
  }
}

/** 内置数据源共用的默认 Provider 注册表。 */
export const marketDataProviderRegistry = new MarketDataProviderRegistry()
