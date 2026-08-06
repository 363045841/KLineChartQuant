import {
  composeFetcherBaseUrl,
  parseFetcherEndpoint,
  setFetcherBaseUrl,
  marketDataProviderRegistry,
  type DataFetcherDefinition,
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

/** 判断数据源是否为本地 MOCK 源（UI 中用于将 mock 沉底展示） */
export function isMockSourceName(name: string): boolean {
  return name === 'mock' || name.startsWith('mock-')
}

/**
 * 对支持搜索的数据源做一次轻量拨测
 * @remarks 查询 "0"、limit 1；只关心请求成败，不要求返回结果
 */
export async function probeAggregationSource(
  source: DataFetcherDefinition,
  signal: AbortSignal,
): Promise<Exclude<AggregationSourceStatus, 'checking'>> {
  const provider = marketDataProviderRegistry.get(source.name)
  if (provider) {
    try {
      const result = await provider.probe(signal)
      return result.status === 'offline' ? 'offline' : 'online'
    } catch {
      return 'offline'
    }
  }
  if (!source.capabilities?.includes('search') || typeof source.searcher !== 'function') {
    return 'offline'
  }
  try {
    await source.searcher(source.name, { query: '0', limit: 1, signal })
    return 'online'
  } catch {
    return 'offline'
  }
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
  sources: ReadonlyArray<DataFetcherDefinition>,
  stored = readStoredSources(),
): string[] {
  const searchable = sources.filter(
    (source) => source.capabilities?.includes('search') && typeof source.searcher === 'function',
  )
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
  sources: ReadonlyArray<DataFetcherDefinition>,
  stored = readStoredSources(),
): Record<string, AggregationSourceEndpoint> {
  const result: Record<string, AggregationSourceEndpoint> = {}
  for (const source of sources) {
    if (!source.defaultBaseUrl) continue
    const baseUrl = stored?.baseUrls?.[source.name] ?? source.defaultBaseUrl
    result[source.name] = parseFetcherEndpoint(baseUrl)
  }
  return result
}

/**
 * 将 UI 上的 host/port 写回 core 运行时覆盖表
 * 与默认相同则清除覆盖，避免多余状态
 */
export function applyAggregationSourceBaseUrls(
  sources: ReadonlyArray<DataFetcherDefinition>,
  endpoints: Record<string, AggregationSourceEndpoint>,
): void {
  for (const source of sources) {
    if (!source.defaultBaseUrl) continue
    const ep = endpoints[source.name]
    if (!ep?.host.trim()) {
      setFetcherBaseUrl(source.name, undefined)
      continue
    }
    const next = composeFetcherBaseUrl(ep.host, ep.port, source.defaultBaseUrl)
    const sameAsDefault =
      next === source.defaultBaseUrl.replace(/\/+$/, '') ||
      next ===
        composeFetcherBaseUrl(
          parseFetcherEndpoint(source.defaultBaseUrl).host,
          parseFetcherEndpoint(source.defaultBaseUrl).port,
          source.defaultBaseUrl,
        )
    setFetcherBaseUrl(source.name, sameAsDefault ? undefined : next)
  }
}

/**
 * 聚合源启用状态 + 地址端口
 * 变更会同步到 localStorage 与 core setFetcherBaseUrl
 */
export function useAggregationSources(sources: ReadonlyArray<DataFetcherDefinition>) {
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
        baseUrls[source.name] = composeFetcherBaseUrl(ep.host, ep.port, source.defaultBaseUrl)
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
