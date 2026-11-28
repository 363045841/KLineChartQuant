/**
 * 警报模块公共出口：契约、状态推导、文档编解码、行情源与服务工厂。
 */
export { decodeAlertDocument } from './impl/alertCodec.js'
export type { AlertDocument } from './impl/alertCodec.js'
export { createAlertRuntime } from './impl/createAlertRuntime.js'
export type { AlertRuntimeOptions } from './impl/createAlertRuntime.js'
export { openBrowserAlertStore } from './impl/alertPersistence.js'
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
