/** Provider、连接和使用策略的权威运行时状态；持久化由宿主负责。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import { asReadonlySignal, createSignal } from '@/foundation/reactivity/signal.js'
import { immutableMap } from '@/foundation/utils/immutableMap.js'
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
import { isFilterableInstrumentType } from '../types.js'

const EMPTY_STATE = Object.freeze<MarketRegistryState>({
  providers: immutableMap(),
  policies: immutableMap(),
  connections: immutableMap(),
})

/** 判断源级能力是否满足请求。 */
function supportsCapability(
  capabilities: SourceCapabilities | undefined,
  query: SourceCapabilityQuery,
): boolean {
  if (!capabilities) return false
  if (
    isFilterableInstrumentType(query.instrumentType) &&
    !capabilities.instrumentTypes.includes(query.instrumentType)
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
  private readonly stateSignal = createSignal(EMPTY_STATE)
  /** 唯一的观察入口；注册、注销和配置更新都发布新的不可变快照。 */
  readonly state = asReadonlySignal(this.stateSignal)

  /** 注册 Provider，并关联或创建它声明的连接。 */
  register(provider: MarketDataProvider, config: MarketDataSourceConfigPatch = {}): void {
    if (config.priority !== undefined && !Number.isFinite(config.priority))
      throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, 'priority must be finite')
    const source = provider.source.id
    if (!source || source !== source.trim())
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        '[MarketDataProviderRegistry] source.id must be non-empty and trimmed',
      )
    const current = this.stateSignal.peek()
    if (current.providers.has(source))
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_STATE,
        `[MarketDataProviderRegistry] source "${source}" is already registered`,
      )
    const connectionId = provider.source.connectionId ?? source
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
    const providers = new Map(current.providers).set(source, provider)
    const policies = new Map(current.policies).set(
      source,
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
    this.stateSignal.set(Object.freeze({ providers: immutableMap(providers), policies: immutableMap(policies), connections: immutableMap(connections) }))
  }

  /** 注销 Provider；最后一个使用者注销时移除连接。 */
  unregister(source: string): boolean {
    const current = this.stateSignal.peek()
    const provider = current.providers.get(source)
    if (!provider) return false
    const connectionId = provider.source.connectionId ?? source
    const providers = new Map(current.providers)
    const policies = new Map(current.policies)
    const connections = new Map(current.connections)
    providers.delete(source)
    policies.delete(source)
    if (
      ![...providers.values()].some(
        (item) => (item.source.connectionId ?? item.source.id) === connectionId,
      )
    )
      connections.delete(connectionId)
    this.stateSignal.set(Object.freeze({ providers: immutableMap(providers), policies: immutableMap(policies), connections: immutableMap(connections) }))
    return true
  }

  get(source: string): MarketDataProvider | undefined {
    return this.stateSignal.peek().providers.get(source)
  }

  /** 要求 Provider 已注册。 */
  getRequired(source: string): MarketDataProvider {
    const provider = this.get(source)
    if (!provider)
      throw new KLineChartError(
        GENERIC_ERROR_CODES.NOT_REGISTERED,
        `[MarketDataProviderRegistry] source "${source}" is not registered`,
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

  setCapabilities(source: string, capabilities: SourceCapabilities | undefined): void {
    const provider = this.getRequired(source)
    provider.source.capabilities = capabilities
  }
  getCapabilities(source: string): SourceCapabilities | undefined {
    return this.getRequired(source).source.capabilities
  }

  /** 从唯一连接配置派生 Provider 地址，避免共用 Connector 的源各存一份地址。 */
  getConfig(source: string): MarketDataSourceConfig {
    const connection = this.getConnection(source)
    const policy = this.stateSignal.peek().policies.get(source)!
    return connection.baseUrl === undefined
      ? { ...policy }
      : { ...policy, baseUrl: connection.baseUrl }
  }

  getConnection(sourceKey: string): MarketConnection {
    const descriptor = this.getRequired(sourceKey).source
    return this.stateSignal.peek().connections.get(descriptor.connectionId ?? sourceKey)!
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
    this.stateSignal.set(Object.freeze({ ...current, connections: immutableMap(connections) }))
  }

  /** 兼容源配置入口；地址写入连接，策略只写入 Provider。 */
  setConfig(source: string, patch: MarketDataSourceConfigPatch): MarketDataSourceConfig {
    if (patch.priority !== undefined && !Number.isFinite(patch.priority))
      throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, 'priority must be finite')
    const connection = this.getConnection(source)
    // 先校验再写入，避免无效地址导致策略半生效。
    const baseUrl = Object.hasOwn(patch, 'baseUrl')
      ? normalizeConnectionUrl(patch.baseUrl)
      : connection.baseUrl
    const current = this.stateSignal.peek()
    const policy = current.policies.get(source)!
    const policies = new Map(current.policies).set(
      source,
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
    this.stateSignal.set(Object.freeze({ ...current, policies: immutableMap(policies), connections: immutableMap(connections) }))
    return this.getConfig(source)
  }

  clear(): void {
    this.stateSignal.set(EMPTY_STATE)
  }
}

/** 未显式注入管理实例时使用的兼容注册表。 */
export const marketDataProviderRegistry = new MarketDataProviderRegistry()
