/**
 * 只读服务的期权取数：序列按层与窗口读，统计按日行（缺失时回退小时行）算。
 *
 * 进程内缓存只存**今天之前**的整日分片：当天的分片还在增长，缓存它会把半天的数据
 * 钉死。分钟层不缓存——一年 52 万行，缓存换不来有价值的命中。
 */

import { dayKeyOf } from '../../options/impl/rollup'
import {
  computeOptionStats,
  type OptionStatSample,
  type OptionStatsStructure,
} from '../../options/impl/stats'
import { type OptionLayer, optionLayerStream } from '../../options/impl/streams'
import type { OptionStatsSource, OptionTermPoint, OptionVolatilityStats } from '../../options/types'
import type { DayShardStore } from '../../storage/types'

/** 序列查询。 */
export interface OptionSeriesQuery {
  /** 期权标的 */
  readonly currency: string
  /** 数据层 */
  readonly layer: OptionLayer
  /** 只取最近多少个日分片；省略时取全部已有分片 */
  readonly days?: number
  /** 最多返回多少行 */
  readonly limit: number
}

/** 序列读取结果。 */
export interface OptionSeriesRead {
  /** 实际读取的日分片（升序） */
  readonly days: readonly string[]
  /** 行，按采集时刻升序 */
  readonly rows: readonly unknown[]
  /** 是否因为 limit 丢掉了更早的行 */
  readonly truncated: boolean
}

/** 期权取数端口。 */
export interface OptionDataReader {
  /**
   * 读一段期权序列。
   *
   * @param query 标的、层、窗口与上限
   * @returns 分片日期、行与被截断标记
   */
  readonly readSeries: (query: OptionSeriesQuery) => OptionSeriesRead

  /**
   * 读一次波动统计。
   *
   * @param currency 期权标的
   * @param windows 窗口天数
   * @returns 统计结果
   */
  readonly readStats: (currency: string, windows: readonly number[]) => OptionVolatilityStats
}

/** 取数器构造参数。 */
export interface OptionDataReaderOptions {
  /** 分片存储 */
  readonly store: DayShardStore
  /** 时钟（毫秒），测试可注入 */
  readonly now: () => number
}

/** 判断是否为普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 读取有限数字；缺失或非数字返回 null。 */
function numberOf(source: unknown, key: string): number | null {
  if (!isRecord(source)) return null
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** 读取非空字符串；缺失或类型不符返回 null。 */
function textOf(source: unknown, key: string): string | null {
  if (!isRecord(source)) return null
  const value = source[key]
  return typeof value === 'string' && value !== '' ? value : null
}

/** 读取嵌套对象；不是对象时返回 null。 */
function recordOf(source: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(source)) return null
  const value = source[key]
  return isRecord(value) ? value : null
}

/**
 * 读一行的平值 IV。
 *
 * v2 起平值 IV 在 `nearTerm.atmIvPercent`；v1（旧采集器的扁平行）在 `nearTermAtmIvPercent`。
 * 按 `schemaVersion` 分支而不是按字段猜：保留期 365 天会跨过 v1→v2 的边界，v1 行在
 * 老分片里仍然存在，读到却当 null 会让历史样本凭空少掉一半。
 *
 * @param row 快照行
 * @returns 平值 IV 百分数；缺失为 null
 */
function atmIvOf(row: unknown): number | null {
  if (numberOf(row, 'schemaVersion') === 1) return numberOf(row, 'nearTermAtmIvPercent')
  return numberOf(recordOf(row, 'nearTerm'), 'atmIvPercent')
}

/**
 * 把一行快照转成统计样本。
 *
 * @param day 该行所属 UTC 日
 * @param row 快照行
 * @returns 样本；缺少采集时刻时返回 null
 */
function sampleOf(day: string, row: unknown): OptionStatSample | null {
  const capturedAt = numberOf(row, 'capturedAt')
  if (capturedAt === null) return null
  return {
    day,
    capturedAt,
    atmIvPercent: atmIvOf(row),
    spotIndex: numberOf(row, 'spotIndex'),
  }
}

/**
 * 读一行快照的期限结构与 25Δ 偏斜。
 *
 * schema 2 及更早的行没有这些字段，返回 null；不拿别的日子顶替，也不用分钟行补。
 *
 * @param row 快照行
 * @returns 结构；没有可用字段时为 null
 */
function structureOf(row: unknown): OptionStatsStructure | null {
  if (row === null) return null
  const expiries: OptionTermPoint[] = []
  const raw = isRecord(row) ? row.expiries : undefined
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const expiryIso = textOf(item, 'expiryIso')
      const dteDays = numberOf(item, 'dteDays')
      const atmIvPercent = numberOf(item, 'atmIvPercent')
      if (expiryIso === null || dteDays === null || atmIvPercent === null) continue
      expiries.push({ expiryIso, dteDays, atmIvPercent })
    }
  }
  const skew25dVolPoints = numberOf(row, 'skew25dVolPoints')
  if (expiries.length === 0 && skew25dVolPoints === null) return null
  return {
    expiries,
    skew25dVolPoints,
    skew25dExpiryIso: textOf(row, 'skew25dExpiryIso'),
  }
}

/**
 * 创建期权取数器。
 *
 * @param options 存储与时钟
 * @returns 取数端口
 */
export function createOptionDataReader(options: OptionDataReaderOptions): OptionDataReader {
  const store = options.store
  const closedDayCache = new Map<string, readonly unknown[]>()

  /**
   * 读一天分片，整日分片命中缓存。
   *
   * @param stream 流标识
   * @param layer 数据层
   * @param day UTC 日期
   * @returns 行
   */
  function readDay(stream: string, layer: OptionLayer, day: string): readonly unknown[] {
    const cacheable = layer !== 'minute' && day < dayKeyOf(options.now())
    if (!cacheable) return store.read({ stream, day })
    const key = `${stream}|${day}`
    const cached = closedDayCache.get(key)
    if (cached !== undefined) return cached
    const rows = store.read({ stream, day })
    closedDayCache.set(key, rows)
    return rows
  }

  /**
   * 读某层最近若干天的全部行。
   *
   * @param currency 标的
   * @param layer 数据层
   * @param days 最多读多少个日分片；省略时读全部
   * @returns 分片日期与行
   */
  function readLayer(
    currency: string,
    layer: OptionLayer,
    days: number | undefined,
  ): { days: readonly string[]; rows: readonly unknown[] } {
    const stream = optionLayerStream(currency, layer)
    const available = store.listDays(stream)
    const picked = days === undefined ? available : available.slice(-days)
    const rows: unknown[] = []
    for (const day of picked) {
      rows.push(...readDay(stream, layer, day))
    }
    return { days: picked, rows }
  }

  /**
   * 按天收敛小时样本：同一天取采集时刻最晚的一行，并保留原始行供取结构。
   *
   * @param day 行所属日期
   * @param rows 当天的小时行
   * @returns 最晚的样本与原始行；当天没有可用行为 null
   */
  function latestOfDay(
    day: string,
    rows: readonly unknown[],
  ): { sample: OptionStatSample; row: unknown } | null {
    let best: { sample: OptionStatSample; row: unknown } | null = null
    for (const row of rows) {
      const sample = sampleOf(day, row)
      if (sample === null) continue
      if (best === null || sample.capturedAt > best.sample.capturedAt) best = { sample, row }
    }
    return best
  }

  return {
    readSeries(query) {
      const { days, rows } = readLayer(query.currency, query.layer, query.days)
      const truncated = rows.length > query.limit
      return {
        days,
        rows: truncated ? rows.slice(rows.length - query.limit) : rows,
        truncated,
      }
    },

    readStats(currency, windows) {
      const width = Math.max(1, ...windows)
      const now = options.now()
      const dailyStream = optionLayerStream(currency, 'daily')
      const daily = readLayer(currency, 'daily', width)
      const dailySamples: OptionStatSample[] = []
      let latestDaily: { sample: OptionStatSample; row: unknown } | null = null
      for (const day of daily.days) {
        for (const row of readDay(dailyStream, 'daily', day)) {
          const sample = sampleOf(day, row)
          if (sample === null) continue
          dailySamples.push(sample)
          if (latestDaily === null || sample.capturedAt > latestDaily.sample.capturedAt) {
            latestDaily = { sample, row }
          }
        }
      }
      if (dailySamples.length > 0) {
        return computeOptionStats({
          samples: dailySamples,
          windows,
          source: 'daily',
          now,
          structure: latestDaily === null ? null : structureOf(latestDaily.row),
        })
      }

      const hourlyStream = optionLayerStream(currency, 'hourly')
      const hourly = readLayer(currency, 'hourly', width)
      const hourlySamples: OptionStatSample[] = []
      let latestHourly: { sample: OptionStatSample; row: unknown } | null = null
      for (const day of hourly.days) {
        const best = latestOfDay(day, readDay(hourlyStream, 'hourly', day))
        if (best === null) continue
        hourlySamples.push(best.sample)
        if (latestHourly === null || best.sample.capturedAt > latestHourly.sample.capturedAt) {
          latestHourly = best
        }
      }
      const source: OptionStatsSource = hourlySamples.length > 0 ? 'hourly' : 'none'
      return computeOptionStats({
        samples: hourlySamples,
        windows,
        source,
        now,
        structure: latestHourly === null ? null : structureOf(latestHourly.row),
      })
    },
  }
}
