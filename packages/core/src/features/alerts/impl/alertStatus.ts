/**
 * 警报状态的唯一推导算法。
 *
 * 不落盘任何状态字段；UI 与服务都调用同一函数，避免多处各自推导。
 */
import type { Alert, AlertStatus } from '../types.js'

/** 按优先级推导状态：手动暂停 > 已触发 > 已过期 > 执行失败 > 运行中。 */
export function alertStatus(alert: Alert, now: number): AlertStatus {
  if (!alert.enabled) return 'paused'
  if (alert.frequency === 'once' && alert.lastFiredAt !== undefined) return 'triggered'
  if (alert.expiresAt !== undefined && now >= alert.expiresAt) return 'expired'
  if (alert.lastError !== undefined) return 'error'
  return 'active'
}
