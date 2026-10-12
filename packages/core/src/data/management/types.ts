/** 行情管理实例的连接、策略、配置持久化与探测契约。 */
import type { MarketDataProvider, MarketDataSourceConfig } from '../provider/types.js'

/** 一个 Connector 实例；版本随生效地址变化，供请求与缓存判定身份。 */
export interface MarketConnection {
  readonly id: string
  readonly defaultBaseUrl?: string
  readonly baseUrl?: string
  readonly editable: boolean
  readonly version: number
}

/** 注册表的权威状态；配置更新通过替换快照发布。 */
export interface MarketRegistryState {
  readonly providers: ReadonlyMap<string, MarketDataProvider>
  readonly policies: ReadonlyMap<string, Readonly<Omit<MarketDataSourceConfig, 'baseUrl'>>>
  readonly connections: ReadonlyMap<string, MarketConnection>
}

/** 可交给宿主持久化的配置，不包含凭据和探测结果。 */
export interface MarketDataConfiguration {
  readonly connections: Readonly<Record<string, { readonly baseUrl?: string }>>
  readonly policies: Readonly<
    Record<
      string,
      {
        readonly enabled: boolean
        readonly searchEnabled: boolean
        readonly priority: number
      }
    >
  >
}

/** 每个 Provider 的可用性；连接可达不等于所有上游 Provider 可用。 */
export interface MarketProviderHealth {
  readonly status: 'checking' | 'online' | 'offline' | 'degraded'
  readonly checkedAt: number
  readonly connectionVersion: number
  readonly latencyMs?: number
  readonly message?: string
}

export interface MarketHealthOptions {
  readonly names?: ReadonlySet<string>
  readonly force?: boolean
}
