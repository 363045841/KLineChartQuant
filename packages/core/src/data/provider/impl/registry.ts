/** Provider、连接和使用策略的权威运行时状态；持久化由宿主负责。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import { createSignal, type ReadonlySignal } from '@/foundation/reactivity/signal.js'
import { normalizeConnectionUrl } from '../../management/impl/connection.js'
import { participatesInSearch } from '../../management/impl/policy.js'
import type { MarketConnection, MarketRegistryState } from '../../management/types.js'
import type {
  MarketDataProvider,
  MarketDataSourceConfig,
  MarketDataSourceConfigPatch,
  SourceCapabilities,
  SourceCapabilityQuery,
} from '../types.js'
import { isFilterableAssetClass } from '../types.js'

/**
 * 能力入库前与前端实际实现对齐。
 *
 * probe 声明的能力是跨仓库契约，connector 可能先于前端升级。声明了 `liveBars`
 * 却没有流工厂时，在入库处降级并明确报错，而不是把契约漂移留给运行时的状态通知链。
 */
function alignCapabilities(
  provider: MarketDataProvider,
  capabilities: SourceCapabilities | undefined,
): SourceCapabilities | undefined {
  if (capabilities?.liveBars !== true || provider.liveBars !== undefined) return capabilities
  console.error(
    `[MarketDataProviderRegistry] source "${provider.source.id}" declares liveBars but provides no stream implementation; live bars disabled`,
  )
  return { ...capabilities, liveBars: false }
}

/** 判断源级能力是否满足请求。 */
function supportsCapability(
  capabilities: SourceCapabilities | undefined,
  query: SourceCapabilityQuery,
): boolean {
  if (!capabilities) return false
  if (
    isFilterableAssetClass(query.assetClass) &&
    !capabilities.assetClasses.includes(query.assetClass)
  )
    return false
  if (query.capability === 'timeShare') return capabilities.timeShare === true
  if (query.capability === 'timeShareRange')
    return (
      capabilities.timeShareRange !== undefined &&
      (query.days === undefined || capabilities.timeShareRange.maxTradingDays >= query.days)
    )
  if (query.capability === 'depth') return capabilities.depth === true
  const bars = capabilities.bars
  return Boolean(
    bars &&
      (query.period === undefined || bars.periods.includes(query.period)) &&
      (query.adjustment === undefined || bars.adjustments.includes(query.adjustment)),
  )
}

/** 管理实例的注册与配置入口；所有读者共享同一份不可变快照。 */
export class MarketDataProviderRegistry {
  private readonly stateSignal = createSignal<MarketRegistryState>({
    providers: new Map(),
    policies: new Map(),
    connections: new Map(),
  })
  /** 唯一的观察入口；注册、注销和配置更新都发布新的不可变快照。 */
  readonly state: ReadonlySignal<MarketRegistryState> = this.stateSignal

  /** 注册 Provider，并关联或创建它声明的连接。 */
  register(provider: MarketDataProvider, config: MarketDataSourceConfigPatch = {}): void {
    if (config.priority !== undefined && !Number.isFinite(config.priority))
      throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, 'priority must be finite')
    const sourceId = provider.source.id
    if (!sourceId || sourceId !== sourceId.trim())
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        '[MarketDataProviderRegistry] source.id must be non-empty and trimmed',
      )
    const current = this.stateSignal.peek()
    if (current.providers.has(sourceId))
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_STATE,
        `[MarketDataProviderRegistry] source "${sourceId}" is already registered`,
      )
    const connectionId = provider.source.connectionId ?? sourceId
    if (!connectionId.trim() || connectionId !== connectionId.trim())
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        'connectionId must be non-empty and trimmed',
      )
    const defaultBaseUrl = normalizeConnectionUrl(provider.source.defaultBaseUrl)
    const baseUrl = normalizeConnectionUrl(config.baseUrl)
    const previous = current.connections.get(connectionId)
    if (
      previous &&
      (previous.defaultBaseUrl !== defaultBaseUrl ||
        previous.editable !== (provider.source.endpointEditable !== false))
    )
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        `Conflicting connection definition: ${connectionId}`,
      )
    const providers = new Map(current.providers).set(sourceId, provider)
    const policies = new Map(current.policies).set(
      sourceId,
      Object.freeze({
        enabled: config.enabled ?? true,
        priority: config.priority ?? 0,
        ...(config.searchEnabled === undefined ? {} : { searchEnabled: config.searchEnabled }),
      }),
    )
    const connections = new Map(current.connections)
    connections.set(
      connectionId,
      Object.freeze(
        previous ?? {
          id: connectionId,
          defaultBaseUrl,
          baseUrl,
          editable: provider.source.endpointEditable !== false,
          version: 0,
        },
      ),
    )
    this.stateSignal.set({ providers, policies, connections })
  }

  /** 注销 Provider；最后一个使用者注销时移除连接。 */
  unregister(sourceId: string): boolean {
    const current = this.stateSignal.peek()
    const provider = current.providers.get(sourceId)
    if (!provider) return false
    const connectionId = provider.source.connectionId ?? sourceId
    const providers = new Map(current.providers)
    const policies = new Map(current.policies)
    const connections = new Map(current.connections)
    providers.delete(sourceId)
    policies.delete(sourceId)
    if (
      ![...providers.values()].some(
        (item) => (item.source.connectionId ?? item.source.id) === connectionId,
      )
    )
      connections.delete(connectionId)
    this.stateSignal.set({ providers, policies, connections })
    return true
  }

  get(sourceId: string): MarketDataProvider | undefined {
    return this.stateSignal.peek().providers.get(sourceId)
  }

  /** 要求 Provider 已注册。 */
  getRequired(sourceId: string): MarketDataProvider {
    const provider = this.get(sourceId)
    if (!provider)
      throw new KLineChartError(
        GENERIC_ERROR_CODES.NOT_REGISTERED,
        `[MarketDataProviderRegistry] source "${sourceId}" is not registered`,
      )
    return provider
  }

  getAll(): ReadonlyArray<MarketDataProvider> {
    return [...this.stateSignal.peek().providers.values()]
  }
  getEnabled(): ReadonlyArray<MarketDataProvider> {
    return this.getAll().filter((item) => this.getConfig(item.source.id).enabled)
  }
  getEnabledByPriority(): ReadonlyArray<MarketDataProvider> {
    return this.byPriority(this.getEnabled())
  }

  /** 品种搜索使用独立策略，不由自动路由开关决定。 */
  getSearchableByPriority(): ReadonlyArray<MarketDataProvider> {
    return this.byPriority(
      this.getAll().filter(
        (item) => item.catalog && participatesInSearch(this.getConfig(item.source.id)),
      ),
    )
  }

  private byPriority(
    providers: ReadonlyArray<MarketDataProvider>,
  ): ReadonlyArray<MarketDataProvider> {
    return [...providers].sort(
      (left, right) =>
        this.getConfig(right.source.id).priority - this.getConfig(left.source.id).priority,
    )
  }

  getEnabledByCapability(query: SourceCapabilityQuery): ReadonlyArray<MarketDataProvider> {
    return this.getEnabledByPriority().filter((item) =>
      supportsCapability(this.getCapabilities(item.source.id), query),
    )
  }

  setCapabilities(sourceId: string, capabilities: SourceCapabilities | undefined): void {
    const provider = this.getRequired(sourceId)
    provider.source.capabilities = alignCapabilities(provider, capabilities)
  }
  getCapabilities(sourceId: string): SourceCapabilities | undefined {
    return this.getRequired(sourceId).source.capabilities
  }

  /** 从唯一连接配置派生 Provider 地址，避免共用 Connector 的源各存一份地址。 */
  getConfig(sourceId: string): MarketDataSourceConfig {
    const connection = this.getConnection(sourceId)
    const policy = this.stateSignal.peek().policies.get(sourceId)!
    return connection.baseUrl === undefined
      ? { ...policy }
      : { ...policy, baseUrl: connection.baseUrl }
  }

  getConnection(sourceId: string): MarketConnection {
    const source = this.getRequired(sourceId).source
    return this.stateSignal.peek().connections.get(source.connectionId ?? sourceId)!
  }

  /** 一个连接改址时，所有关联 Provider 同时生效。 */
  setConnection(connectionId: string, value: string | undefined): void {
    const current = this.stateSignal.peek()
    const connection = current.connections.get(connectionId)
    if (!connection)
      throw new KLineChartError(
        GENERIC_ERROR_CODES.NOT_REGISTERED,
        `Unknown connection: ${connectionId}`,
      )
    const baseUrl = normalizeConnectionUrl(value)
    if (baseUrl === connection.baseUrl) return
    const connections = new Map(current.connections).set(
      connectionId,
      Object.freeze({
        ...connection,
        baseUrl,
        version: connection.version + 1,
      }),
    )
    this.stateSignal.set({ ...current, connections })
  }

  /** 兼容源配置入口；地址写入连接，策略只写入 Provider。 */
  setConfig(sourceId: string, patch: MarketDataSourceConfigPatch): MarketDataSourceConfig {
    if (patch.priority !== undefined && !Number.isFinite(patch.priority))
      throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, 'priority must be finite')
    const connection = this.getConnection(sourceId)
    // 先校验再写入，避免无效地址导致策略半生效。
    const baseUrl = Object.hasOwn(patch, 'baseUrl')
      ? normalizeConnectionUrl(patch.baseUrl)
      : connection.baseUrl
    const current = this.stateSignal.peek()
    const policy = current.policies.get(sourceId)!
    const policies = new Map(current.policies).set(
      sourceId,
      Object.freeze({
        enabled: patch.enabled ?? policy.enabled,
        priority: patch.priority ?? policy.priority,
        ...((patch.searchEnabled ?? policy.searchEnabled) === undefined
          ? {}
          : {
              searchEnabled: patch.searchEnabled ?? policy.searchEnabled,
            }),
      }),
    )
    const connections = new Map(current.connections)
    if (baseUrl !== connection.baseUrl)
      connections.set(
        connection.id,
        Object.freeze({
          ...connection,
          baseUrl,
          version: connection.version + 1,
        }),
      )
    this.stateSignal.set({ ...current, policies, connections })
    return this.getConfig(sourceId)
  }

  clear(): void {
    this.stateSignal.set({ providers: new Map(), policies: new Map(), connections: new Map() })
  }
}

/** 未显式注入管理实例时使用的兼容注册表。 */
export const marketDataProviderRegistry = new MarketDataProviderRegistry()
