/**
 * 警报模块公共出口：契约、状态推导、文档编解码与本地服务。
 */
export { ALERT_DOCUMENT_VERSION, decodeFires, decodeRules } from './impl/alertCodec.js'
export type { AlertFiresDocument, AlertRulesDocument } from './impl/alertCodec.js'
export { createLocalAlertService } from './impl/createLocalAlertService.js'
export type { LocalAlertServiceDependencies } from './impl/createLocalAlertService.js'
export { alertStatus } from './impl/alertStatus.js'
export type {
  Alert,
  AlertChange,
  AlertChannel,
  AlertDraft,
  AlertFire,
  AlertFrequency,
  AlertHistoryQuery,
  AlertId,
  AlertLimits,
  AlertNotifier,
  AlertService,
  AlertStatus,
} from './types.js'
