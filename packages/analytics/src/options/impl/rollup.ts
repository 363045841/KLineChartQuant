/**
 * 期权滚上：把分钟行压成小时行与日行。
 *
 * 口径固定为「时段边界那一刻的分钟行原样快照」，不做均值——IV 是瞬时报价，均值没有
 * 金融含义，均值只会制造一套与分钟行对不上的第二套数字。
 *
 * 幂等：只处理已结束的时段，去重键取时段起点，重复跑不产生重复行；断线期间漏掉的
 * 时段由下一轮自动补上。
 */
import type { DayShardStore } from '../../storage/types'
import type { OptionAggregateSnapshot } from '../types'
import { optionLayerStream } from './streams'

/** 一小时的毫秒数。 */
const HOUR_MS = 3_600_000

/** 一天的毫秒数。 */
const DAY_MS = 86_400_000

/** 缺日行的历史分片之外，最近这几天也要重扫：当天的时段还在陆续结束。 */
const RECENT_RESCAN_DAYS = 2

/** 滚上请求。 */
export interface OptionRollupRequest {
  /** 分片存储 */
  readonly store: DayShardStore
  /** 期权标的 */
  readonly currency: string
  /** 时钟（毫秒），测试可注入 */
  readonly now: () => number
  /** 只处理该日及之后的分钟分片（YYYY-MM-DD）；省略时按缺日行自动挑 */
  readonly fromDay?: string
}

/** 滚上结果。 */
export interface OptionRollupResult {
  /** 标的 */
  readonly currency: string
  /** 本次处理过的分钟分片日期 */
  readonly days: readonly string[]
  /** 新写入的小时行数 */
  readonly hourRows: number
  /** 新写入的日行数 */
  readonly dayRows: number
  /** 已存在而被去重跳过的小时行数 */
  readonly skippedHourRows: number
  /** 已存在而被去重跳过的日行数 */
  readonly skippedDayRows: number
}

/** 一个时段桶：边界行与桶内的分钟行数。 */
interface PeriodBucket {
  row: OptionAggregateSnapshot
  count: number
}

/**
 * 取毫秒时刻所属整点的小时起点。
 *
 * @param capturedAt 采集时刻（毫秒）
 * @returns 该小时起点毫秒
 */
export function hourStartOf(capturedAt: number): number {
  return Math.floor(capturedAt / HOUR_MS) * HOUR_MS
}

/**
 * 取毫秒时刻所属 UTC 日起点。
 *
 * @param capturedAt 采集时刻（毫秒）
 * @returns 该日 UTC 零点毫秒
 */
export function dayStartOf(capturedAt: number): number {
  return Math.floor(capturedAt / DAY_MS) * DAY_MS
}

/**
 * 取毫秒时刻所属 UTC 日。
 *
 * @param capturedAt 采集时刻（毫秒）
 * @returns `YYYY-MM-DD`
 */
export function dayKeyOf(capturedAt: number): string {
  return new Date(capturedAt).toISOString().slice(0, 10)
}

/**
 * 小时行的去重键：小时起点。
 *
 * @param capturedAt 采集时刻（毫秒）
 * @returns 形如 `2026-11-16T07` 的键
 */
function hourKeyOf(capturedAt: number): string {
  return new Date(hourStartOf(capturedAt)).toISOString().slice(0, 13)
}

/**
 * 把一批分钟行按小时分桶，只保留已结束的小时，取每小时最后一行。
 *
 * @param rows 同一 UTC 日内的分钟行
 * @param nowMs 当前毫秒
 * @returns 小时行（升序），带 `aggregatedRows`
 */
export function buildHourRows(
  rows: readonly OptionAggregateSnapshot[],
  nowMs: number,
): readonly OptionAggregateSnapshot[] {
  const buckets = new Map<number, PeriodBucket>()
  for (const row of rows) {
    if (!Number.isFinite(row.capturedAt)) continue
    const start = hourStartOf(row.capturedAt)
    if (start + HOUR_MS > nowMs) continue
    const bucket = buckets.get(start)
    if (bucket === undefined) {
      buckets.set(start, { row, count: 1 })
      continue
    }
    if (row.capturedAt > bucket.row.capturedAt) bucket.row = row
    bucket.count += 1
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, bucket]) => ({ ...bucket.row, aggregatedRows: bucket.count }))
}

/**
 * 把一批分钟行按 UTC 日分桶，只保留已结束的日子，取每日最后一行。
 *
 * @param rows 分钟行（通常来自一个日分片）
 * @param nowMs 当前毫秒
 * @returns 日行（升序），带 `aggregatedRows`
 */
export function buildDayRows(
  rows: readonly OptionAggregateSnapshot[],
  nowMs: number,
): readonly OptionAggregateSnapshot[] {
  const buckets = new Map<number, PeriodBucket>()
  for (const row of rows) {
    if (!Number.isFinite(row.capturedAt)) continue
    const start = dayStartOf(row.capturedAt)
    if (start + DAY_MS > nowMs) continue
    const bucket = buckets.get(start)
    if (bucket === undefined) {
      buckets.set(start, { row, count: 1 })
      continue
    }
    if (row.capturedAt > bucket.row.capturedAt) bucket.row = row
    bucket.count += 1
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, bucket]) => ({ ...bucket.row, aggregatedRows: bucket.count }))
}

/**
 * 写出一个层的滚上行，按分片统计新增与跳过。
 *
 * @param store 存储
 * @param stream 目标流
 * @param rows 滚上行
 * @param keyOf 时段起点键
 * @returns 新增与跳过行数
 */
function appendPeriodRows(
  store: DayShardStore,
  stream: string,
  rows: readonly OptionAggregateSnapshot[],
  keyOf: (capturedAt: number) => string,
): { appended: number; skipped: number } {
  if (rows.length === 0) return { appended: 0, skipped: 0 }
  const results = store.append({
    stream,
    rows,
    dayOf: (row) => row.capturedAt,
    dedupeKey: (row) => keyOf(row.capturedAt),
  })
  let appended = 0
  let skipped = 0
  for (const result of results) {
    appended += result.appended
    skipped += result.skipped
  }
  return { appended, skipped }
}

/**
 * 找出需要重扫的分钟分片日。
 *
 * 两类：还没有日行的历史分片（回填、断线补洞），以及最近两天的分片（当天的小时
 * 还在陆续结束）。只挑这两类，采集器每轮调用的成本才是常数级。
 *
 * @param store 存储
 * @param currency 标的
 * @param nowMs 当前毫秒
 * @param fromDay 只处理该日及之后；省略时不限制
 * @returns 待处理的日期（升序）
 */
export function rollupCandidateDays(
  store: DayShardStore,
  currency: string,
  nowMs: number,
  fromDay?: string,
): readonly string[] {
  const knownDayRows = new Set(store.listDays(optionLayerStream(currency, 'daily')))
  const recentDay = dayKeyOf(nowMs - RECENT_RESCAN_DAYS * DAY_MS)
  return store
    .listDays(optionLayerStream(currency, 'minute'))
    .filter(
      (day) =>
        (fromDay === undefined || day >= fromDay) && (!knownDayRows.has(day) || day >= recentDay),
    )
}

/**
 * 对某个标的补齐小时行与日行。
 *
 * @param request 存储、标的、时钟与可选起始日
 * @returns 处理过的日期与写入行数
 */
export function rollupOptionDays(request: OptionRollupRequest): OptionRollupResult {
  const nowMs = request.now()
  const minuteStream = optionLayerStream(request.currency, 'minute')
  const days = rollupCandidateDays(request.store, request.currency, nowMs, request.fromDay)

  const hourRows: OptionAggregateSnapshot[] = []
  const dayRows: OptionAggregateSnapshot[] = []
  for (const day of days) {
    const rows = request.store.read<OptionAggregateSnapshot>({ stream: minuteStream, day })
    if (rows.length === 0) continue
    hourRows.push(...buildHourRows(rows, nowMs))
    dayRows.push(...buildDayRows(rows, nowMs))
  }

  const hourly = appendPeriodRows(
    request.store,
    optionLayerStream(request.currency, 'hourly'),
    hourRows,
    hourKeyOf,
  )
  const daily = appendPeriodRows(
    request.store,
    optionLayerStream(request.currency, 'daily'),
    dayRows,
    dayKeyOf,
  )

  return {
    currency: request.currency,
    days,
    hourRows: hourly.appended,
    dayRows: daily.appended,
    skippedHourRows: hourly.skipped,
    skippedDayRows: daily.skipped,
  }
}
