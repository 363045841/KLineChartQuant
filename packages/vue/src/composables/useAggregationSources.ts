import {
  marketDataProviderRegistry,
} from '@363045841yyt/klinechart-core/controllers'
import { computed, ref, watch } from 'vue'

/** localStorage 键：启用列表 + 各源地址覆盖 */
export const AGGREGATION_SOURCES_STORAGE_KEY = 'klinechart.aggregation-sources'

/** 单个数据源的地址编辑草稿 */
export interface AggregationSourceEndpoint {
  host: string
  port: string
}

interface StoredAggregationSources {
  known: string[]
  enabled: string[]
  /** source name -> 完整 Base URL */
  baseUrls?: Record<string, string>
}

export type AggregationSourceStatus = 'checking' | 'online' | 'offline'

/** 聚合源拨测结果：在线时附带请求延迟毫秒。 */
export interface AggregationSourceProbeResult {
  status: 'online' | 'offline'
  latencyMs?: number
}

/** 聚合源管理 UI 所需的最小元数据。 */
export interface AggregationSourceDefinition {
  name: string
  displayName: string
  description?: string
  capabilities?: ReadonlyArray<string>
  defaultBaseUrl?: string
}

/** 解析 Provider 默认地址，供 UI 编辑 host/port。 */
export function parseProviderEndpoint(baseUrl: string): AggregationSourceEndpoint {
  const url = new URL(baseUrl)
  return { host: url.hostname, port: url.port || (url.protocol === 'https:' ? '443' : '80') }
}

/** 根据 UI 的 host/port 生成 Provider 地址覆盖。 */
function composeProviderBaseUrl(host: string, port: string, defaultBaseUrl: string): string {
  const url = new URL(defaultBaseUrl)
  url.hostname = host.trim()
  url.port = port.trim()
  return url.toString().replace(/\/$/, '')
}

/** 判断数据源是否为本地 MOCK 源（UI 中用于将 mock 沉底展示） */
export function isMockSourceName(name: string): boolean {
  return name === 'mock' || name.startsWith('mock-')
}

/**
 * 对支持搜索的数据源做一次轻量拨测
 * @remarks 查询 "0"、limit 1；只关心请求成败，不要求返回结果
 */
export async function probeAggregationSource(
  source: AggregationSourceDefinition,
  signal: AbortSignal,
): Promise<AggregationSourceProbeResult> {
  const provider = marketDataProviderRegistry.get(source.name)
  if (!provider) return { status: 'offline' }
  try {
    const probeResult = await provider.probe(signal)
    const result: AggregationSourceProbeResult = {
      status: probeResult.status === 'offline' ? 'offline' : 'online',
    }
    if (probeResult.latencyMs !== undefined) result.latencyMs = probeResult.latencyMs
    return result
  } catch {
    return { status: 'offline' }
  }
}

/** Provider catalog 存在时，该源可参与聚合搜索。 */
export function supportsAggregationSourceSearch(source: AggregationSourceDefinition): boolean {
  return Boolean(marketDataProviderRegistry.get(source.name)?.catalog)
}

function readStoredSources(): StoredAggregationSources | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const value = JSON.parse(window.localStorage.getItem(AGGREGATION_SOURCES_STORAGE_KEY) ?? '')
    if (!Array.isArray(value?.known) || !Array.isArray(value?.enabled)) return undefined
    return value
  } catch {
    return undefined
  }
}

/**
 * 根据注册表与已存配置，算出应启用的搜索源
 * 首次：全部可搜索源启用；已有配置：新注册源默认启用，旧源沿用开关
 */
export function resolveEnabledAggregationSources(
  sources: ReadonlyArray<AggregationSourceDefinition>,
  stored = readStoredSources(),
): string[] {
  const searchable = sources.filter(supportsAggregationSourceSearch)
  if (!stored) return searchable.map((source) => source.name)

  const known = new Set(stored.known)
  const enabled = new Set(stored.enabled)
  return searchable
    .filter((source) => !known.has(source.name) || enabled.has(source.name))
    .map((source) => source.name)
}

/**
 * 从 definition.defaultBaseUrl 与 localStorage 合并出每个可配置源的 host/port
 */
export function resolveAggregationSourceEndpoints(
  sources: ReadonlyArray<AggregationSourceDefinition>,
  stored = readStoredSources(),
): Record<string, AggregationSourceEndpoint> {
  const result: Record<string, AggregationSourceEndpoint> = {}
  for (const source of sources) {
    if (!source.defaultBaseUrl) continue
    const baseUrl = stored?.baseUrls?.[source.name] ?? source.defaultBaseUrl
    result[source.name] = parseProviderEndpoint(baseUrl)
  }
  return result
}

/**
 * 将 UI 上的 host/port 写回 core 运行时覆盖表
 * 与默认相同则清除覆盖，避免多余状态
 */
export function applyAggregationSourceBaseUrls(
  sources: ReadonlyArray<AggregationSourceDefinition>,
  endpoints: Record<string, AggregationSourceEndpoint>,
): void {
  for (const source of sources) {
    if (!source.defaultBaseUrl) continue
    const provider = marketDataProviderRegistry.get(source.name)
    const ep = endpoints[source.name]
    if (!provider) continue
    if (!ep?.host.trim()) {
      marketDataProviderRegistry.setConfig(source.name, { baseUrl: undefined })
      continue
    }
    const next = composeProviderBaseUrl(ep.host, ep.port, source.defaultBaseUrl)
    const sameAsDefault =
      next === source.defaultBaseUrl.replace(/\/+$/, '') ||
      next ===
        composeProviderBaseUrl(
          parseProviderEndpoint(source.defaultBaseUrl).host,
          parseProviderEndpoint(source.defaultBaseUrl).port,
          source.defaultBaseUrl,
        )
    marketDataProviderRegistry.setConfig(source.name, {
      baseUrl: sameAsDefault ? undefined : next,
    })
  }
}

/**
 * 聚合源启用状态 + 地址端口
 * 变更会同步到 localStorage 与 Provider 注册表
 */
export function useAggregationSources(sources: ReadonlyArray<AggregationSourceDefinition>) {
  const enabledNames = ref(resolveEnabledAggregationSources(sources))
  const enabledNameSet = computed(() => new Set(enabledNames.value))
  const endpoints = ref(resolveAggregationSourceEndpoints(sources))

  // 启动时立刻把已存地址灌进 core，保证首轮搜索/K 线就走用户配置
  applyAggregationSourceBaseUrls(sources, endpoints.value)

  function setEnabled(name: string, enabled: boolean) {
    const next = new Set(enabledNames.value)
    if (enabled) next.add(name)
    else next.delete(name)
    enabledNames.value = sources
      .filter((source) => next.has(source.name))
      .map((source) => source.name)
  }

  /**
   * 更新某个源的 host 或 port
   * 立即写回 core 覆盖，并触发持久化 watch
   */
  function setEndpoint(name: string, patch: Partial<AggregationSourceEndpoint>) {
    const current = endpoints.value[name] ?? { host: '', port: '' }
    endpoints.value = {
      ...endpoints.value,
      [name]: {
        host: patch.host ?? current.host,
        port: patch.port ?? current.port,
      },
    }
    applyAggregationSourceBaseUrls(sources, endpoints.value)
  }

  watch(
    [enabledNames, endpoints],
    () => {
      if (typeof window === 'undefined') return
      const baseUrls: Record<string, string> = {}
      for (const source of sources) {
        if (!source.defaultBaseUrl) continue
        const ep = endpoints.value[source.name]
        if (!ep?.host.trim()) continue
        baseUrls[source.name] = composeProviderBaseUrl(ep.host, ep.port, source.defaultBaseUrl)
      }
      const value: StoredAggregationSources = {
        known: sources.map((source) => source.name),
        enabled: enabledNames.value,
        baseUrls,
      }
      try {
        window.localStorage.setItem(AGGREGATION_SOURCES_STORAGE_KEY, JSON.stringify(value))
      } catch {
        // localStorage 不可用时保留当前会话状态
      }
    },
    { deep: true, immediate: true },
  )

  return {
    enabledNames,
    enabledNameSet,
    endpoints,
    setEnabled,
    setEndpoint,
  }
}
