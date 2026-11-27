/**
 * Node 入口：只导出不含图表的运行时模块。
 *
 * 图表、渲染、控制器与所有宿主适配器都不在这里。`tsconfig.node.json` 以
 * `lib: ["ESNext"]` 编译本文件，任何被拖进来的 DOM 类型都会让构建失败。
 */

export { createMarketRuntime } from './engine/runtime/impl/createMarketRuntime.js'
export type { MarketRuntime, MarketRuntimeOptions } from './engine/runtime/types.js'

export { createDefinitionRegistry } from './engine/indicators/registry/impl/createDefinitionRegistry.js'
export type { DefinitionRegistry } from './engine/indicators/registry/types.js'

export { createMarketDataHost, MarketDataContext } from './data/management/context.js'
export { MarketDataProviderRegistry } from './data/provider/registry.js'
export { createBuiltinMarketDataContext } from './data/provider/impl/sources/createBuiltinContext.js'
export { installBuiltinProviders } from './data/provider/impl/sources/builtinProviders.js'
export type { HttpSourceOptions } from './data/provider/impl/sources/createHttpSource.js'
export type { EventStream, EventStreamFactory, EventStreamHandlers } from './data/stream/types.js'
export type { SymbolSpec } from './foundation/types/instrument.js'
export type { KLineData, TimeShareData } from './foundation/types/bar.js'

export { createAlertRuntime } from './features/alerts/impl/createAlertRuntime.js'
export type { AlertRuntime, AlertRuntimeOptions } from './features/alerts/impl/createAlertRuntime.js'
export { createAlertService } from './features/alerts/impl/createAlertService.js'
export { DEFAULT_ALERT_LIMITS } from './features/alerts/types.js'
export type {
  AlertFiresDocument,
  AlertRulesDocument,
} from './features/alerts/impl/alertCodec.js'
export type {
  Alert,
  AlertChannel,
  AlertDraft,
  AlertFire,
  AlertFrequency,
  AlertId,
  AlertLimits,
  AlertService,
  AlertStatus,
} from './features/alerts/types.js'

export { createDocumentStore } from './foundation/persistence/impl/documentStore.js'
export { createMemoryDocumentStore } from './foundation/persistence/impl/memoryDocumentStore.js'
export type {
  CreateDocumentStoreOptions,
  DocumentDriver,
  DocumentKey,
  DocumentStore,
  DocumentTransaction,
  PersistenceCodec,
} from './foundation/persistence/types.js'

export { systemClock } from './foundation/utils/clock.js'
export type { Clock } from './foundation/utils/clock.js'
