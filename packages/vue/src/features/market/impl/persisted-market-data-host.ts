/**
 * 浏览器行情宿主的组合根：内置 Provider + 预览源 + localStorage 配置持久化。
 *
 * 本文件是浏览器差异的唯一落点：EventSource、localStorage、页面恢复监听都在这里
 * 注入，Core 只消费契约。Web 与 Desktop 共用同一份存储 key，迁移逻辑不重复。
 */
import {
  createLocalStoragePersistence,
  isKLineChartError,
  type PersistenceCodec,
} from '@363045841yyt/klinechart-core'
import type {
  EventStreamFactory,
  MarketDataConfiguration,
  MarketDataContext,
} from '@363045841yyt/klinechart-core/market-data'
import {
  createBuiltinMarketDataContext,
  createMockDataSource,
} from '@363045841yyt/klinechart-core/market-data/sources'
import type { PersistedMarketDataHost } from '../types.js'

/** 当前配置文档的存储 key；改名会让已有配置失效。 */
const CONFIGURATION_KEY = 'klinechart.market-data'

/** v0.9 之前的 Provider 连接地址旧 key，只做一次迁移。 */
const LEGACY_CONNECTIONS_KEY = 'klinechart.aggregation-sources'

/** 浏览器事件流：Core 只声明契约，EventSource 属于宿主。 */
const openEventStream: EventStreamFactory = (url, handlers) => {
  const source = new EventSource(url)
  source.onopen = () => handlers.onOpen()
  source.onmessage = (event) => {
    if (typeof event.data === 'string') handlers.onData(event.data)
  }
  source.onerror = () => handlers.onError()
  return { close: () => source.close() }
}

/** 校验持久化文档；损坏或缺字段的记录按不存在处理。 */
function isConfiguration(value: unknown): value is MarketDataConfiguration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const connections: unknown = Object.getOwnPropertyDescriptor(value, 'connections')?.value
  const policies: unknown = Object.getOwnPropertyDescriptor(value, 'policies')?.value
  if (
    !connections ||
    typeof connections !== 'object' ||
    Array.isArray(connections) ||
    !policies ||
    typeof policies !== 'object' ||
    Array.isArray(policies)
  )
    return false
  return (
    Object.values(connections).every((entry: unknown) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
      const baseUrl: unknown = Object.getOwnPropertyDescriptor(entry, 'baseUrl')?.value
      if (baseUrl === undefined) return true
      if (typeof baseUrl !== 'string') return false
      try {
        const url = new URL(baseUrl)
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      } catch {
        return false
      }
    }) &&
    Object.values(policies).every(
      (entry: unknown) =>
        !!entry &&
        typeof entry === 'object' &&
        typeof Object.getOwnPropertyDescriptor(entry, 'enabled')?.value === 'boolean' &&
        typeof Object.getOwnPropertyDescriptor(entry, 'searchEnabled')?.value === 'boolean' &&
        Number.isFinite(Object.getOwnPropertyDescriptor(entry, 'priority')?.value),
    )
  )
}

const codec: PersistenceCodec<MarketDataConfiguration> = {
  decode(value) {
    return isConfiguration(value) ? value : null
  },
  encode(value) {
    return value
  },
}

/** 读取旧版文档内容；不可访问或格式不符时返回空。 */
function readLegacyDocument(): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(
      globalThis.localStorage.getItem(LEGACY_CONNECTIONS_KEY) ?? 'null',
    )
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/** 把旧版按 Provider 保存的目录地址迁移到当前目录，并移除来源的无效地址残留。 */
function migrateLegacyConnections(context: MarketDataContext): void {
  const legacy = readLegacyDocument()
  if (!legacy) return
  const known: unknown = legacy.known
  const enabled: unknown = legacy.enabled
  const baseUrls: unknown = legacy.baseUrls
  const migratedConnections = new Set<string>()
  for (const provider of context.registry.getAll()) {
    const id = provider.source.id
    if (Array.isArray(known) && known.includes(id) && Array.isArray(enabled))
      context.registry.setConfig(id, { searchEnabled: enabled.includes(id) })
    const connection = context.registry.getConnection(id)
    const baseUrl =
      baseUrls && typeof baseUrls === 'object'
        ? Object.getOwnPropertyDescriptor(baseUrls, id)?.value
        : undefined
    if (
      typeof baseUrl !== 'string' ||
      !connection.editable ||
      migratedConnections.has(connection.id)
    )
      continue
    try {
      context.applyConnection(connection.id, baseUrl)
      migratedConnections.add(connection.id)
    } catch {
      // 无效的旧地址保留默认配置。
    }
  }
}

/** 页面恢复监听：只在浏览器宿主注册，Core 不感知窗口事件。 */
function attachPageRestore(context: MarketDataContext): () => void {
  const resume = (): void => context.stream.resume()
  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') resume()
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pageshow', resume)
  window.addEventListener('online', resume)
  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pageshow', resume)
    window.removeEventListener('online', resume)
  }
}

/** 装配浏览器行情宿主与配置持久化；配置变更后串行写回。 */
export function createPersistedMarketDataHost(): PersistedMarketDataHost {
  const storage = createLocalStoragePersistence({ key: CONFIGURATION_KEY, codec })
  let saved: ReturnType<typeof storage.load> | undefined
  try {
    saved = storage.load()
  } catch (error) {
    console.error(
      '[Market data preferences] Restore failed',
      error instanceof Error ? error.message : error,
    )
    if (isKLineChartError(error, 'PERSISTENCE_CORRUPT')) saved = null
  }
  const context = createBuiltinMarketDataContext({
    fetchImpl: (input, init) => globalThis.fetch(input, init),
    openEventStream,
  })
  // 预览源是浏览器组合根的决定，不进通用装配。
  context.registerDataSource(createMockDataSource())
  if (saved) context.restore(saved)
  const detachPageRestore = attachPageRestore(context)
  // 没有可恢复配置时先迁移旧地址，再落默认配置，避免下次启动重复迁移。
  if (saved === null) {
    migrateLegacyConnections(context)
    save()
  }
  function save(): void {
    try {
      storage.save(context.configuration.peek())
    } catch (error) {
      console.error(
        '[Market data preferences] Save failed',
        error instanceof Error ? error.message : error,
      )
    }
  }
  const unsubscribe = context.configuration.subscribe(save)
  return {
    context,
    dispose() {
      unsubscribe()
      detachPageRestore()
      context.dispose()
      storage.dispose()
    },
  }
}
