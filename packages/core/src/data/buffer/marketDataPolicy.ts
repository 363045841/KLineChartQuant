/** 行情缓存取数策略：定义初始窗口大小与统一重试退避。 */
import { DEFAULT_KLINE_PERIOD } from '../provider/types'

// ── Constants ──

export const FETCH_MAX_RETRIES = 2 // 最大重试次数
export const FETCH_TOTAL_ATTEMPTS = FETCH_MAX_RETRIES + 1
/** 初始加载和向左增量加载的统一页大小。 */
export const DEFAULT_BAR_PAGE_LIMIT = 500

// ── Helpers ──

const PERIOD_INITIAL_DAYS: Record<string, number> = {
  '1min': 3,
  '5min': 30,
  '15min': 60,
  '30min': 90,
  '60min': 180,
  daily: 365,
  weekly: 365,
  monthly: 365,
  quarterly: 365,
  yearly: 365,
  timeshare: 1,
}

export function getPeriodDays(period?: string): number {
  return PERIOD_INITIAL_DAYS[period ?? DEFAULT_KLINE_PERIOD] ?? 365
}

// ── Retry backoff: 失败后等待约 1 秒 / 2 秒 ──

export function retryBackoffMs(attempt: number): number {
  return 1_000 * 2 ** Math.max(0, attempt - 1)
}

