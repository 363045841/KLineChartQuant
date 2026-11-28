import type { BarsSeries } from '../../data/service/index.js'
import type { SeriesViewportSnapshot } from '../viewport/viewMemory/index.js'

/** 完成历史准备后，调用方才能提交序列。取消时立即释放未提交的句柄。 */
export async function preparePrimaryHistory(
  bars: BarsSeries,
  window: SeriesViewportSnapshot | null,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted()
  const release = () => bars.dispose()
  signal.addEventListener('abort', release, { once: true })
  try {
    await bars.initialHistory
    signal.throwIfAborted()
    if (!window) return
    await bars.ensureCoverageFrom(window.fromTime)
    signal.throwIfAborted()
    const range = bars.loadedTimeRange
    if (!range || range.earliestTs > window.fromTime || range.latestTs < window.toTime) {
      throw new Error(bars.lastError.peek() ?? '已保存的视口超出可用历史范围')
    }
  } finally {
    signal.removeEventListener('abort', release)
  }
}
