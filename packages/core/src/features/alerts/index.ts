/**
 * 警报模块公共出口：契约、状态推导、文档编解码、行情源与服务工厂。
 */
export { ALERT_DOCUMENT_VERSION, decodeFires, decodeRules } from './impl/alertCodec.js'
export type { AlertFiresDocument, AlertRulesDocument } from './impl/alertCodec.js'
export { createAlertFeeds } from './impl/createAlertFeeds.js'
export type { AlertFeedLease } from './impl/createAlertFeeds.js'
export { createAlertRuntime } from './impl/createAlertRuntime.js'
export type { AlertRuntime, AlertRuntimeOptions } from './impl/createAlertRuntime.js'
export { createAlertStores } from './impl/alertPersistence.js'
export { createAlertService } from './impl/createAlertService.js'
export { DEFAULT_ALERT_LIMITS } from './types.js'
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
} from './types.js'
