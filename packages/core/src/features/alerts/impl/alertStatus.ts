/**
 * 警报状态的唯一推导算法。
 *
 * 不落任何状态字段；UI 与列表都调用同一份函数，不在别处重复推导。
 * 频率由脚本声明，调用方从目录读取后传入。
 */
import type { Alert, AlertFrequency, AlertStatus } from '../types.js'

/** 状态优先级：停用 > 已触发 > 已过期 > 执行失败 > 等待中。 */
export function alertStatus(
  alert: Alert,
  frequency: AlertFrequency | undefined,
  now: number,
): AlertStatus {
  if (!alert.enabled) return 'paused'
  // 脚本已不存在或未声明频率时，规则不可能再求值。
  if (frequency === undefined) return 'error'
  if (frequency === 'once' && alert.lastFiredAt !== undefined) return 'triggered'
  if (alert.expiresAt !== undefined && now >= alert.expiresAt) return 'expired'
  if (alert.lastError !== undefined) return 'error'
  return 'active'
}
