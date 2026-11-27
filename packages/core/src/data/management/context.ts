/**
 * 行情宿主的唯一持有者：注册表、实时连接与健康检查共享同一份权威快照。
 *
 * 宿主只装配数据源与管理配置；连接实现由 Provider 声明，页面恢复等宿主行为
 * 留在组合根，Core 不再探测运行环境。
 */
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import { batch, type ReadonlySignal } from '@/foundation/reactivity/signal.js'
import { createRegisteredDataSource } from '../provider/impl/registeredDataSource.js'
import { MarketDataProviderRegistry } from '../provider/registry.js'
import type { MarketDataSource } from '../provider/types.js'
import { createStreamHub } from '../stream/impl/hub.js'
import type { StreamHub } from '../stream/types.js'
import type { MarketDataConfiguration } from './types.js'
import { normalizeConnectionUrl } from './impl/connection.js'
import { MarketDataHealth } from './impl/health.js'
import { participatesInSearch } from './impl/policy.js'

/** 连接、Provider 目录和策略共享注册表中的权威快照。 */
export class MarketDataContext {
  private readonly registrations = new Set<() => void>()
  private disposed = false
  private readonly unsubscribeSources: () => void

  /** 注册宿主数据源；返回幂等注销函数，取消该来源的在途查询和实时订阅。 */
  registerDataSource(source: MarketDataSource): () => void {
    if (this.disposed)
      throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_STATE, 'Market data host is disposed')
    const registration = createRegisteredDataSource(source)
    this.registry.register(registration.provider)
    const unregister = () => {
      if (!this.registrations.delete(unregister)) return
      registration.dispose()
      this.registry.unregister(source.id)
    }
    this.registrations.add(unregister)
    return unregister
  }

  /** 按来源及稳定 ID 解析品种，不使用全局默认源猜测。 */
  async resolveInstrument(source: string, id: string, signal?: AbortSignal) {
    const provider = this.registry.getRequired(source)
    if (!provider.catalog?.resolve)
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_STATE,
        `Source does not implement instrument resolution: ${source}`,
      )
    return provider.catalog.resolve(id, signal)
  }
  readonly health: MarketDataHealth
  readonly configuration: ReadonlySignal<MarketDataConfiguration>

  /** 宿主共享的实时连接注册表；图表与自选共用同一份连接。 */
  readonly stream: StreamHub

  constructor(readonly registry = new MarketDataProviderRegistry()) {
    this.health = new MarketDataHealth(registry)
    this.stream = createStreamHub({
      createTransport: (request, handlers) => {
        const provider = registry.getRequired(request.source)
        // 数据源没有实时能力时明确失败，不退回到某种通用连接实现。
        if (!provider.stream)
          throw new KLineChartError(
            GENERIC_ERROR_CODES.INVALID_STATE,
            `[${request.source}] does not declare a realtime stream`,
          )
        return provider.stream(request, handlers)
      },
    })
    this.unsubscribeSources = registry.state.subscribe(() => this.probeUnresolvedSources())
    this.probeUnresolvedSources()
    const read = (): MarketDataConfiguration => {
      const state = registry.state()
      return {
        connections: Object.fromEntries(
          [...state.connections].map(([id, connection]) => [
            id,
            {
              ...(connection.baseUrl === undefined ? {} : { baseUrl: connection.baseUrl }),
            },
          ]),
        ),
        policies: Object.fromEntries(
          [...state.policies].map(([id, policy]) => [
            id,
            {
              enabled: policy.enabled,
              searchEnabled: participatesInSearch(policy),
              priority: policy.priority,
            },
          ]),
        ),
      }
    }
    this.configuration = Object.assign(read, { peek: read, subscribe: registry.state.subscribe })
  }

  /** 新来源或改址后先确认健康，检测结果再单向驱动池，避免先发连接再补状态。 */
  private probeUnresolvedSources(): void {
    const health = this.health.state.peek()
    const names = new Set(
      this.registry
        .getEnabled()
        .filter((provider) => health[provider.source.id] === undefined)
        .map((provider) => provider.source.id),
    )
    if (names.size > 0) void this.health.refresh({ names })
  }

  /** 提交完整连接地址；宿主管理的连接不允许从管理界面修改。 */
  applyConnection(connectionId: string, baseUrl: string | undefined): void {
    const connection = this.registry.state.peek().connections.get(connectionId)
    if (!connection?.editable)
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_STATE,
        `Connection is not editable: ${connectionId}`,
      )
    this.registry.setConnection(connectionId, baseUrl)
  }

  /** 宿主恢复配置；只恢复当前目录中的实体，已停用的数据源不会被重新注册。 */
  restore(configuration: MarketDataConfiguration): void {
    // 全部校验通过才进入 batch，失败时不会留下半份生效配置。
    for (const [id, value] of Object.entries(configuration.connections)) {
      if (this.registry.state.peek().connections.get(id)?.editable)
        normalizeConnectionUrl(value.baseUrl)
    }
    for (const [id, policy] of Object.entries(configuration.policies)) {
      if (this.registry.get(id) && !Number.isFinite(policy.priority))
        throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, 'priority must be finite')
    }
    batch(() => {
      for (const [id, value] of Object.entries(configuration.connections)) {
        if (this.registry.state.peek().connections.get(id)?.editable)
          this.applyConnection(id, value.baseUrl)
      }
      for (const [id, policy] of Object.entries(configuration.policies)) {
        if (this.registry.get(id)) this.registry.setConfig(id, policy)
      }
    })
  }

  /** 由宿主释放；图表卸载不销毁共享实例。 */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribeSources()
    this.stream.dispose()
    for (const unregister of this.registrations) unregister()
    this.health.dispose()
  }
}

/** 创建独立行情宿主；公开注册 API 复用同一管理实例。 */
export function createMarketDataHost(): MarketDataContext {
  return new MarketDataContext()
}
