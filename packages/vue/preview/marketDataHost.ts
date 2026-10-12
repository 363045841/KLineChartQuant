/** 示例宿主负责行情实例的创建、配置恢复和持久化。 */
import { createLocalStoragePersistence, type PersistenceCodec } from '@363045841yyt/klinechart-core'
import type { MarketDataConfiguration } from '@363045841yyt/klinechart-core/market-data'
import { createBuiltinMarketDataContext } from '@363045841yyt/klinechart-core/market-data/sources'

/** 校验持久化文档，损坏记录不进入运行时。 */
function isConfiguration(value: unknown): value is MarketDataConfiguration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const connections: unknown = Object.getOwnPropertyDescriptor(value, 'connections')?.value
  const policies: unknown = Object.getOwnPropertyDescriptor(value, 'policies')?.value
  if (!connections || typeof connections !== 'object' || Array.isArray(connections) ||
    !policies || typeof policies !== 'object' || Array.isArray(policies)) return false
  return Object.values(connections).every((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
    const baseUrl: unknown = Object.getOwnPropertyDescriptor(entry, 'baseUrl')?.value
    if (baseUrl === undefined) return true
    if (typeof baseUrl !== 'string') return false
    try { const url = new URL(baseUrl); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password } catch { return false }
  }) && Object.values(policies).every((entry: unknown) => entry && typeof entry === 'object' &&
    typeof Object.getOwnPropertyDescriptor(entry, 'enabled')?.value === 'boolean' &&
    typeof Object.getOwnPropertyDescriptor(entry, 'searchEnabled')?.value === 'boolean' &&
    Number.isFinite(Object.getOwnPropertyDescriptor(entry, 'priority')?.value))
}

const codec: PersistenceCodec<MarketDataConfiguration> = {
  decode(value) { return isConfiguration(value) ? value : null },
  encode(value) { return value },
}

/** 同一页面的所有图表显式共享一个实例；Core 与 Vue 库不选择存储介质。 */
export function createPreviewMarketDataHost() {
  const storage = createLocalStoragePersistence({ key: 'klinechart.market-data', codec })
  const saved = storage.load()
  const context = createBuiltinMarketDataContext(saved ?? undefined)
  if (!saved) {
    // 旧版按 Provider 保存地址；只迁移已注册、可编辑的连接，不恢复已移除源。
    try {
      const legacy: unknown = JSON.parse(localStorage.getItem('klinechart.aggregation-sources') ?? 'null')
      if (legacy && typeof legacy === 'object') {
        const known: unknown = Object.getOwnPropertyDescriptor(legacy, 'known')?.value
        const enabled: unknown = Object.getOwnPropertyDescriptor(legacy, 'enabled')?.value
        const baseUrls: unknown = Object.getOwnPropertyDescriptor(legacy, 'baseUrls')?.value
        const migratedConnections = new Set<string>()
        for (const provider of context.registry.getAll()) {
          const id = provider.source.id
          if (Array.isArray(known) && known.includes(id) && Array.isArray(enabled))
            context.registry.setConfig(id, { searchEnabled: enabled.includes(id) })
          const connection = context.registry.getConnection(id)
          const baseUrl: unknown = baseUrls && typeof baseUrls === 'object'
            ? Object.getOwnPropertyDescriptor(baseUrls, id)?.value : undefined
          if (typeof baseUrl === 'string' && connection.editable && !migratedConnections.has(connection.id)) {
            try {
              context.applyConnection(connection.id, baseUrl)
              migratedConnections.add(connection.id)
            } catch { /* 无效旧地址保留默认配置。 */ }
          }
        }
      }
    } catch { /* 不可访问或损坏的旧存储不阻止挂载。 */ }
    storage.save(context.configuration.peek())
  }
  const unsubscribe = context.configuration.subscribe(() => storage.save(context.configuration.peek()))
  return { context, dispose() { unsubscribe(); context.dispose() } }
}
