/** 宿主持有的行情管理实例：统一配置入口，Core 不选择持久化介质。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import { batch, type ReadonlySignal } from '@/foundation/reactivity/signal.js'
import {
  MarketDataProviderRegistry,
  marketDataProviderRegistry,
} from '../../provider/impl/registry.js'
import type { MarketDataConfiguration } from '../types.js'
import { normalizeConnectionUrl } from './connection.js'
import { MarketDataHealth } from './health.js'
import { participatesInSearch } from './policy.js'

/** 连接、Provider 目录和策略共享注册表中的权威快照。 */
export class MarketDataContext {
  readonly health: MarketDataHealth
  readonly configuration: ReadonlySignal<MarketDataConfiguration>

  constructor(readonly registry = new MarketDataProviderRegistry()) {
    this.health = new MarketDataHealth(registry)
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
    this.health.dispose()
  }
}

/** 兼容未提供实例的宿主；不隐式访问 localStorage。 */
export const defaultMarketDataContext = new MarketDataContext(marketDataProviderRegistry)
