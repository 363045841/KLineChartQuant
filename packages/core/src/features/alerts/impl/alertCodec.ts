/**
 * 警报文档编解码。
 *
 * 只接受当前版本；结构不完整直接抛错，避免把损坏数据当成空文档。
 * 旧版本从未发布，因此不存在任何迁移分支。
 */
import type { Alert, AlertFire } from '../types.js'
import type { CalculationInputs, CalculationInputValue } from '../../../engine/calculation/index.js'
import { isSymbolSpec } from '@/data/symbolSpecGuard.js'
import { deepFreezeSnapshot } from '../../../foundation/utils/deepFreezeSnapshot.js'

export const ALERT_DOCUMENT_VERSION = 2

export interface AlertDocument {
  readonly version: typeof ALERT_DOCUMENT_VERSION
  readonly alerts: readonly Alert[]
  readonly fires: readonly AlertFire[]
}

/** 拒绝非对象，避免后续字段读取静默得到 undefined。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value))
    throw new TypeError(`${label} must be an object`)
  return value
}

/** 读取必需数组字段。 */
function asArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`)
  return value
}

function inputValue(value: unknown): value is CalculationInputValue {
  return value === null || typeof value === 'boolean' || typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (Array.isArray(value) ? value.every(inputValue) : isInputs(value))
}

function isInputs(value: unknown): value is CalculationInputs {
  return isRecord(value) && Object.values(value).every(inputValue)
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('Expected alert text field')
  return value
}

function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('Expected finite alert number')
  return value
}

/** 解码规则文档；版本不符视为损坏。 */
function decodeAlerts(value: unknown): readonly Alert[] {
  const alerts = asArray(value, 'Alert rules').map((item) => {
    const rule = asRecord(item, 'Alert')
    const script = asRecord(rule.script, 'Alert script')
    const channels = asArray(rule.channels, 'Alert channels')
    if (!isSymbolSpec(rule.symbol) || typeof rule.enabled !== 'boolean' || !isInputs(script.inputs) ||
        channels.length === 0 || !channels.every((channel) => channel === 'in-app' || channel === 'sound')) {
      throw new TypeError(`Invalid alert rule ${String(rule.id)}`)
    }
    return deepFreezeSnapshot({
      id: text(rule.id), name: text(rule.name),
      script: { definitionId: text(script.definitionId), inputs: script.inputs },
      symbol: rule.symbol, enabled: rule.enabled, message: text(rule.message), channels,
      createdAt: number(rule.createdAt),
      ...(rule.cooldownMs === undefined ? {} : { cooldownMs: number(rule.cooldownMs) }),
      ...(rule.expiresAt === undefined ? {} : { expiresAt: number(rule.expiresAt) }),
      ...(rule.lastFiredAt === undefined ? {} : { lastFiredAt: number(rule.lastFiredAt) }),
      ...(rule.lastFiredBarTime === undefined ? {} : { lastFiredBarTime: number(rule.lastFiredBarTime) }),
      ...(rule.lastError === undefined ? {} : { lastError: text(rule.lastError) }),
    } satisfies Alert)
  })
  return Object.freeze(alerts)
}

/** 解码触发日志；与规则分开存储，互不影响。 */
function decodeFires(value: unknown): readonly AlertFire[] {
  const fires = asArray(value, 'Alert fires').map((item) => {
    const fire = asRecord(item, 'Alert fire')
    const source = asRecord(fire.source, 'Alert fire source')
    return deepFreezeSnapshot({
      id: text(fire.id), alertId: text(fire.alertId), firedAt: number(fire.firedAt),
      source: { ticker: text(source.ticker), interval: text(source.interval) },
      message: text(fire.message), price: number(fire.price), barTime: number(fire.barTime),
    })
  })
  return Object.freeze(fires)
}

/** 恢复统一文档，规则与触发记录共享一次提交。 */
export function decodeAlertDocument(value: unknown): AlertDocument {
  const root = asRecord(value, 'Alert document')
  if (root.version !== ALERT_DOCUMENT_VERSION)
    throw new TypeError(`Unsupported alert document version: ${String(root.version)}`)
  return Object.freeze({ version: ALERT_DOCUMENT_VERSION, alerts: decodeAlerts(root.alerts), fires: decodeFires(root.fires) })
}

/** 一次性导入旧宿主的规则与触发文档。 */
export function importAlertDocuments(rules: readonly unknown[], logs: readonly unknown[]): AlertDocument {
  const read = (value: unknown, field: string): unknown => {
    const document = asRecord(value, 'Legacy alert document')
    if (document.version !== 1) throw new TypeError('Invalid legacy alert document version')
    return document[field]
  }
  const alerts = new Map(rules.flatMap((value) => decodeAlerts(read(value, 'alerts'))).map((alert) => [alert.id, alert]))
  const fires = new Map(logs.flatMap((value) => decodeFires(read(value, 'fires'))).map((fire) => [fire.id, fire]))
  return { version: ALERT_DOCUMENT_VERSION, alerts: [...alerts.values()], fires: [...fires.values()].sort((a, b) => b.firedAt - a.firedAt) }
}
