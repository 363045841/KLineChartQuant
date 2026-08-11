/** 缓冲层取数 Effect 编排：定义 K 线/分时 Service tag、初始窗口天数、重试退避与 fetch 入口。 */
import { Context, Effect, pipe } from 'effect'
import type { Effect as EffectType } from 'effect/Effect'

import type { KLineData, SymbolSpec } from '../../controllers/types'
import type { TimeShareFetchResult } from '../legacy/types'
import type { BarPageRequest } from './dataBufferTypes'

// ── KLine fetch service tag ──
// Tag: 定义 Effect 服务接口

export class KLineFetchService extends Context.Tag('@klc/KLineFetchService')<
  KLineFetchService,
  {
    readonly fetch: (
      spec: SymbolSpec,
      page: BarPageRequest,
    ) => EffectType<ReadonlyArray<KLineData>, unknown>
  }
>() {}

// ── TimeShare fetch service tag ──

export class TimeShareFetchService extends Context.Tag('@klc/TimeShareFetchService')<
  TimeShareFetchService,
  {
    readonly fetch: (spec: SymbolSpec, date?: number) => EffectType<TimeShareFetchResult, unknown>
  }
>() {}

// ── Constants ──

export const MS_PER_DAY = 86_400_000
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
  return PERIOD_INITIAL_DAYS[period ?? 'daily'] ?? 365
}

export function formatDate(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ── Retry backoff: 失败后等待约 1 秒 / 2 秒 ──

export function retryBackoffMs(attempt: number): number {
  return 1_000 * 2 ** Math.max(0, attempt - 1)
}

// ── KLine fetch Effect ──

export const fetchKLine = (
  spec: SymbolSpec,
  page: BarPageRequest,
): EffectType<ReadonlyArray<KLineData>, unknown, KLineFetchService> =>
  pipe(
    Effect.gen(function* () {
      const { fetch } = yield* KLineFetchService // 获取 Service 实例
      const data = yield* fetch(spec, page)
      // 部分无数据品种返回 []
      if (data.length === 0) {
        yield* Effect.logWarning(
          `[DataBuffer] empty data for ${spec.symbol} limit=${page.limit} before=${page.before ?? 'latest'}`,
        )
      }
      return data
    }),
  )

// ── TimeShare fetch Effect ──

export const fetchTimeShare = (
  spec: SymbolSpec,
  date?: number,
): EffectType<TimeShareFetchResult, unknown, TimeShareFetchService> =>
  pipe(
    Effect.gen(function* () {
      const { fetch } = yield* TimeShareFetchService // 获取服务实例
      const result = yield* fetch(spec, date)
      return result
    }),
  )
