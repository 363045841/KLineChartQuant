/**
 * 警报文档编解码。
 *
 * 只接受当前版本；结构不完整直接抛错，避免把损坏数据当成空文档。
 */
import type { Alert, AlertFire } from '../types.js'

export const ALERT_DOCUMENT_VERSION = 1

export interface AlertRulesDocument {
  readonly version: typeof ALERT_DOCUMENT_VERSION
  readonly alerts: readonly Alert[]
}

export interface AlertFiresDocument {
  readonly version: typeof ALERT_DOCUMENT_VERSION
  readonly fires: readonly AlertFire[]
}

/** 拒绝非对象，避免后续字段读取静默得到 undefined。 */
function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new TypeError(`${label} must be an object`)
  return value as Record<string, unknown>
}

/** 读取必需数组字段。 */
function asArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`)
  return value
}

/** 解码规则文档；版本不符视为损坏。 */
export function decodeRules(value: unknown): AlertRulesDocument {
  const root = asRecord(value, 'Alert rules document')
  if (root.version !== ALERT_DOCUMENT_VERSION)
    throw new TypeError(`Unsupported alert rules version: ${String(root.version)}`)
  const alerts = asArray(root.alerts, 'Alert rules').map((item) => {
    const alert = asRecord(item, 'Alert') as unknown as Alert
    if (typeof alert.id !== 'string' || alert.id.length === 0)
      throw new TypeError('Alert id is required')
    if (typeof alert.condition?.definitionId !== 'string')
      throw new TypeError(`Alert ${alert.id} has no definitionId`)
    return Object.freeze(alert)
  })
  return Object.freeze({ version: ALERT_DOCUMENT_VERSION, alerts: Object.freeze(alerts) })
}

/** 解码触发日志；与规则分开存储，互不影响。 */
export function decodeFires(value: unknown): AlertFiresDocument {
  const root = asRecord(value, 'Alert fires document')
  if (root.version !== ALERT_DOCUMENT_VERSION)
    throw new TypeError(`Unsupported alert fires version: ${String(root.version)}`)
  const fires = asArray(root.fires, 'Alert fires').map((item) => {
    const fire = asRecord(item, 'Alert fire') as unknown as AlertFire
    if (typeof fire.id !== 'string' || typeof fire.alertId !== 'string')
      throw new TypeError('Alert fire identity is required')
    return Object.freeze(fire)
  })
  return Object.freeze({ version: ALERT_DOCUMENT_VERSION, fires: Object.freeze(fires) })
}
