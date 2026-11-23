/** 连接策略：退避、抖动、心跳与存活阈值。全部是纯函数，便于表驱动测试。 */

/** 退避参数：指数增长、封顶、稳定期后重置计数。 */
export interface BackoffPolicy {
  readonly baseMs: number
  readonly capMs: number
  /** 连接稳定存活超过该时长才认定恢复成功并清零失败计数。 */
  readonly stableMs: number
}

/** 服务端心跳间隔；协议常量，所有 Connector 一致。 */
export const STREAM_HEARTBEAT_MS = 15_000

/** 连续三个心跳周期没有任何帧，判定链路僵死。 */
export const STREAM_STALE_MS = STREAM_HEARTBEAT_MS * 3

/** 看门狗检查间隔；只做墙钟比较，标签页节流不影响判定正确性。 */
export const STREAM_WATCHDOG_MS = 5_000

export const DEFAULT_BACKOFF: BackoffPolicy = {
  baseMs: 1_000,
  capMs: 30_000,
  stableMs: 30_000,
}

/**
 * 计算第 n 次失败后的等待时长。
 *
 * 使用 full jitter：等待区间为 `[delay/2, delay]`，避免服务重启时全体客户端同频重连。
 *
 * @param attempt - 已连续失败的次数，从 0 开始
 * @param random - 取值 [0, 1) 的随机源；测试注入固定值
 * @param policy - 退避参数
 * @returns 毫秒等待时长
 */
export function backoffDelay(
  attempt: number,
  random: () => number,
  policy: BackoffPolicy = DEFAULT_BACKOFF,
): number {
  const exponential = Math.min(policy.capMs, policy.baseMs * 2 ** Math.max(0, attempt))
  const lower = exponential / 2
  return Math.round(lower + random() * (exponential - lower))
}
