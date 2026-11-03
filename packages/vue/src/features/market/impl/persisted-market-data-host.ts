/**
 * 内置行情实例 + localStorage 配置持久化。
 *
 * Web 与 Desktop 共用同一份存储 key、校验规则与旧版迁移逻辑：这里的任何改动都等于
 * 改变已发布宿主的持久化契约，会让用户已保存的数据源配置读不出来。
 */
import { createLocalStoragePersistence, type PersistenceCodec } from '@363045841yyt/klinechart-core'
import type {
  MarketDataConfiguration,
  MarketDataContext,
} from '@363045841yyt/klinechart-core/market-data'
import { createBuiltinMarketDataContext } from '@363045841yyt/klinechart-core/market-data/sources'
import type { PersistedMarketDataHost } from '../types.js'

/** 当前配置文档的存储 key；改名会让所有宿主的已有配置失效。 */
const CONFIGURATION_KEY = 'klinechart.market-data'

/** v0.9 之前按 Provider 保存地址的 key，只用于一次性迁移。 */
const LEGACY_CONNECTIONS_KEY = 'klinechart.aggregation-sources'

/** 校验持久化文档，损坏或缺字段的记录不进入运行时。 */
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

/** 读取旧版文档；不存在、不可访问或损坏时返回空。 */
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

/** 把旧版按 Provider 保存的开关与地址迁移到当前目录；已移除的源和无效地址被忽略。 */
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
      // 无效旧地址保留默认配置。
    }
  }
}

/** 创建带持久化的行情宿主；配置变更立即写回，旧版地址只在首次启动时迁移。 */
export function createPersistedMarketDataHost(): PersistedMarketDataHost {
  const storage = createLocalStoragePersistence({ key: CONFIGURATION_KEY, codec })
  const saved = storage.load()
  const context = createBuiltinMarketDataContext(saved ?? undefined)
  // 没有可恢复的配置时才迁移旧版地址，并把默认配置落盘，避免下次启动重复迁移。
  if (!saved) {
    migrateLegacyConnections(context)
    storage.save(context.configuration.peek())
  }
  const unsubscribe = context.configuration.subscribe(() =>
    storage.save(context.configuration.peek()),
  )
  return {
    context,
    dispose() {
      unsubscribe()
      context.dispose()
    },
  }
}
