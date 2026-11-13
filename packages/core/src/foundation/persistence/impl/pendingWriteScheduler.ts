// 延迟写入调度器：收敛 debounce 计时器与待写快照，供 LocalStorage / IndexedDB 后端复用同一套时序。
// 具体读写与错误语义由各后端注入，调度器只负责「合并快照 + 到时触发」。
/** 延迟写入的默认 debounce 时长（毫秒）。 */
export const DEFAULT_DEBOUNCE_MS = 1_000

/** 待写快照的调度契约。 */
export interface PendingWriteScheduler<T> {
  /** 记录本次快照并重启 debounce 计时；到时回调 onDue。 */
  schedule(createValue: () => T, onDue: () => void): void
  /** 停止计时并取走待写快照；无待写返回 null。 */
  takePending(): (() => T) | null
  /** 停止计时并丢弃待写快照。 */
  drop(): void
}

/**
 * 创建调度器。
 * @param debounceMs 两次写入之间的最小间隔，到点才回调 onDue
 * @returns 可复用的待写快照调度器
 */
export function createPendingWriteScheduler<T>(debounceMs: number): PendingWriteScheduler<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: (() => T) | null = null

  /** 停止尚未触发的计时器。 */
  function cancelTimer(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  return {
    schedule(createValue, onDue) {
      pending = createValue
      cancelTimer()
      timer = setTimeout(onDue, debounceMs)
    },
    takePending() {
      cancelTimer()
      const next = pending
      pending = null
      return next
    },
    drop() {
      cancelTimer()
      pending = null
    },
  }
}
