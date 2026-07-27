import { Context, Effect, pipe, Schedule } from 'effect'
import type { Effect as EffectType } from 'effect/Effect'

import type { KLineData, SymbolSpec } from '../controllers/types'
import { KLineChartError } from '../errors'
import type { TimeShareFetchResult } from './types'

// ── KLine fetch service tag ──
// Tag: 定义 Effect 服务接口

export class KLineFetchService extends Context.Tag('@klc/KLineFetchService')<
  KLineFetchService,
  {
    readonly fetch: (
      spec: SymbolSpec,
      startTs: number,
      endTs: number,
    ) => EffectType<ReadonlyArray<KLineData>, unknown>
  }
>() {}

// ── TimeShare fetch service tag ──

export class TimeShareFetchService extends Context.Tag('@klc/TimeShareFetchService')<
  TimeShareFetchService,
  {
    readonly fetch: (
      spec: SymbolSpec,
      date?: number,
    ) => EffectType<TimeShareFetchResult, unknown>
  }
>() {}

// ── Constants ──

export const MS_PER_DAY = 86_400_000
const REQUEST_TIMEOUT = '15 seconds'
const FETCH_MAX_RETRIES = 2 // 最大重试次数

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

// ── Retry schedule: exponential backoff ~1s / ~2s ──

const retrySchedule = pipe(
  Schedule.exponential('1 seconds'),
  Schedule.compose(Schedule.recurs(FETCH_MAX_RETRIES)),
)

// ── KLine fetch Effect (retry + timeout + empty-data check) ──

export const fetchKLine = (
  spec: SymbolSpec,
  startTs: number,
  endTs: number,
): EffectType<ReadonlyArray<KLineData>, unknown, KLineFetchService> =>
  pipe(
    Effect.gen(function* () {
      const { fetch } = yield* KLineFetchService // 获取 Service 实例
      const data = yield* pipe(fetch(spec, startTs, endTs), Effect.timeout(REQUEST_TIMEOUT))
      if (data.length === 0) {
        return yield* Effect.fail(
          new KLineChartError(
            'FETCH_FAILED',
            `[DataBuffer] empty data for ${spec.symbol} ${formatDate(startTs)}~${formatDate(endTs)}`,
          ),
        )
      }
      return data
    }),
    Effect.retry(retrySchedule), // 上个 Error 时触发
    Effect.tapError((err) =>
      Effect.logError(`[DataBuffer] fetch failed: ${(err as Error).message}`),
    ),
  )

// ── TimeShare fetch Effect (retry + timeout) ──

export const fetchTimeShare = (
  spec: SymbolSpec,
  date?: number,
): EffectType<TimeShareFetchResult, unknown, TimeShareFetchService> =>
  pipe(
    Effect.gen(function* () {
      const { fetch } = yield* TimeShareFetchService // 获取服务实例
      const result = yield* pipe(fetch(spec, date), Effect.timeout(REQUEST_TIMEOUT))
      return result
    }),
    Effect.retry(retrySchedule),
    Effect.tapError((err) =>
      Effect.logError(`[TimeShareBuffer] fetch failed: ${(err as Error).message}`),
    ),
  )
