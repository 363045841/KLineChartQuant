/**
 * cloudtrade → 分析数据目录的历史迁移。
 *
 * 迁移只写 `legacy/` 子树，与实时采集流物理隔离：
 * 实时流是等间隔样本，cloudtrade 历史是非等间隔快照，混在一起会让后续统计结论失真。
 * 写入走同一套按天分片存储，重复执行幂等（按 symbol+ts、openTime 去重）。
 */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ANALYTICS_ERROR_CODES, AnalyticsError, toError } from '../../errors'
import { createDayShardStore } from '../../storage/impl/dayShardStore'
import { parseVolumeInterval } from '../../volume/impl/binance'
import type { VolumeInterval } from '../../volume/types'
import type {
  CadenceStats,
  CloudtradeOptionRecord,
  LegacyOptionLevelRecord,
  LegacyVolumeBarRecord,
  MigrationManifest,
  MigrationResult,
  VolumeIntervalImport,
} from '../types'
import {
  CLOUDTRADE_OPTION_SYMBOLS,
  CLOUDTRADE_SAMPLING_NOTE,
  CLOUDTRADE_SYMBOL_MAP,
} from '../types'
import { readCloudtradeOptionLevels, readCloudtradeVolume } from './cloudtrade'

/** 迁移输出子目录。 */
const LEGACY_DIR_NAME = 'legacy'

/** 期权聚合位流前缀。 */
const LEGACY_OPTION_STREAM_PREFIX = 'legacy/options-levels'

/** 买卖量流前缀。 */
const LEGACY_VOLUME_STREAM_PREFIX = 'legacy/volume'

/** 清单文件名。 */
const MANIFEST_FILE_NAME = 'MANIFEST.json'

/** 迁移清单随附的注意事项。 */
const MIGRATION_CAVEATS: readonly string[] = [
  CLOUDTRADE_SAMPLING_NOTE,
  'cloudtrade 的 Gamma 翻转位、Call/Put 墙、最大痛点由旧系统独立计算，口径与实时采集器不同，只能做定性参考',
  '买卖量只保留源文件 [ts, buyVol, sellVol, turnover] 四元组，volume_rev 标记源口径版本，单位以源文件为准',
  'cloudtrade 原始记录存在重复写入（同一 ts 多条完全相同的记录），迁移按 symbol+ts 去重',
]

/** 迁移参数。 */
export interface MigrateCloudtradeOptions {
  /** 迁移输出根目录（分析数据目录） */
  readonly rootDir: string
  /** cloudtrade 数据根目录 */
  readonly cloudtradeHome: string
  /** 当前时钟（毫秒），测试可注入 */
  readonly now: () => number
}

/**
 * 解析 ISO 时间字符串。
 *
 * @param text 时间字符串
 * @param context 错误上下文
 * @returns 毫秒时间戳
 * @throws AnalyticsError 无法解析
 */
function parseTimestamp(text: string, context: string): number {
  const value = Date.parse(text)
  if (Number.isNaN(value)) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.CLOUDTRADE_RECORD_INVALID,
      `${context} 的时间无法解析：${text}`,
      { context, text },
    )
  }
  return value
}

/**
 * 取分位数（升序数组上按位置取值）。
 *
 * @param sorted 升序数字数组
 * @param fraction 分位（0..1）
 * @returns 分位值；空数组返回 0
 */
function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) {
    return 0
  }
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
  return sorted[index]
}

/**
 * 保留一位小数。
 *
 * @param value 原始值
 * @returns 四舍五入到一位小数
 */
function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * 计算某来源符号的采样节奏统计。
 *
 * @param symbol 来源符号
 * @param rawRecords 该符号的原始记录数
 * @param uniqueRecords 去重后的记录
 * @returns 采样节奏统计
 */
function computeCadenceStats(
  symbol: string,
  rawRecords: number,
  uniqueRecords: readonly LegacyOptionLevelRecord[],
): CadenceStats {
  const timestamps = uniqueRecords
    .map((record) => record.capturedAt)
    .sort((left, right) => left - right)
  const gaps: number[] = []
  for (let index = 1; index < timestamps.length; index += 1) {
    gaps.push((timestamps[index] - timestamps[index - 1]) / 60_000)
  }
  gaps.sort((left, right) => left - right)

  const perDay = new Map<string, number>()
  for (const timestamp of timestamps) {
    const day = new Date(timestamp).toISOString().slice(0, 10)
    perDay.set(day, (perDay.get(day) ?? 0) + 1)
  }
  const dailyCounts = [...perDay.values()].sort((left, right) => left - right)

  return {
    symbol,
    uniqueSnapshots: timestamps.length,
    rawRecords,
    duplicateRecords: rawRecords - timestamps.length,
    firstDay: new Date(timestamps[0]).toISOString().slice(0, 10),
    lastDay: new Date(timestamps[timestamps.length - 1]).toISOString().slice(0, 10),
    gapMedianMinutes: roundToOneDecimal(percentile(gaps, 0.5)),
    gapP90Minutes: roundToOneDecimal(percentile(gaps, 0.9)),
    gapMaxMinutes: roundToOneDecimal(gaps.length === 0 ? 0 : gaps[gaps.length - 1]),
    snapshotsPerDayMedian: percentile(dailyCounts, 0.5),
  }
}

/**
 * 把 cloudtrade 记录转换成迁移后的聚合位记录。
 *
 * @param record 源记录
 * @param context 错误上下文
 * @returns 迁移记录
 * @throws AnalyticsError 符号未知或时间非法
 */
function toLegacyOptionLevel(
  record: CloudtradeOptionRecord,
  context: string,
): LegacyOptionLevelRecord {
  const mapped = CLOUDTRADE_SYMBOL_MAP[record.symbol]
  if (mapped === undefined) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.CLOUDTRADE_RECORD_INVALID,
      `${context} 的符号不在迁移名单：${record.symbol}`,
      { context, symbol: record.symbol },
    )
  }
  return {
    schemaVersion: 1,
    source: 'cloudtrade',
    symbol: record.symbol,
    currency: mapped.currency,
    capturedAt: parseTimestamp(record.ts, `${context}.ts`),
    sourceTimestamp: record.src === null ? null : parseTimestamp(record.src, `${context}.src`),
    gammaFlipUsd: record.gammaFlip,
    callWallUsd: record.callWall,
    putWallUsd: record.putWall,
    maxPainUsd: record.maxPain,
    spotUsd: record.spot,
    samplingNote: CLOUDTRADE_SAMPLING_NOTE,
  }
}

/**
 * 原子写入 JSON 文件（先写临时文件再改名）。
 *
 * @param path 目标文件
 * @param value 任意可序列化值
 * @throws AnalyticsError 写入失败
 */
function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const tempPath = `${path}.tmp-${process.pid}`
  try {
    writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf8')
    renameSync(tempPath, path)
  } catch (error) {
    throw new AnalyticsError(ANALYTICS_ERROR_CODES.STORAGE_WRITE_FAILED, `清单写入失败：${path}`, {
      path,
      cause: toError(error).message,
    })
  }
}

/**
 * 执行 cloudtrade 历史迁移。
 *
 * @param options 输出目录、来源目录与时钟
 * @returns 迁移结果与写入清单的路径
 * @throws AnalyticsError 来源缺失、记录非法或写入失败
 */
export function migrateCloudtradeData(options: MigrateCloudtradeOptions): MigrationResult {
  const store = createDayShardStore(options.rootDir)
  const generatedAt = options.now()

  // ---- 期权聚合位 ----
  const optionSource = readCloudtradeOptionLevels(options.cloudtradeHome)
  const optionShardWrites: string[] = []
  const cadence: CadenceStats[] = []
  let optionRecordsImported = 0
  let duplicatesDropped = 0

  for (const symbol of CLOUDTRADE_OPTION_SYMBOLS) {
    const sourceRecords = optionSource.records.filter((record) => record.symbol === symbol)
    if (sourceRecords.length === 0) {
      continue
    }
    const legacyRecords: LegacyOptionLevelRecord[] = []
    for (let index = 0; index < sourceRecords.length; index += 1) {
      legacyRecords.push(toLegacyOptionLevel(sourceRecords[index], `${symbol}#${index}`))
    }

    const appends = store.append({
      stream: `${LEGACY_OPTION_STREAM_PREFIX}/${symbol}`,
      rows: legacyRecords,
      dayOf: (row) => row.capturedAt,
      dedupeKey: (row) => `${row.symbol}|${row.capturedAt}`,
    })
    optionShardWrites.push(...appends.map((append) => append.path))
    optionRecordsImported += appends.reduce((sum, append) => sum + append.appended, 0)

    const uniqueByTimestamp = new Map<number, LegacyOptionLevelRecord>()
    for (const record of legacyRecords) {
      if (!uniqueByTimestamp.has(record.capturedAt)) {
        uniqueByTimestamp.set(record.capturedAt, record)
      }
    }
    const uniqueRecords = [...uniqueByTimestamp.values()]
    duplicatesDropped += legacyRecords.length - uniqueRecords.length
    cadence.push(computeCadenceStats(symbol, sourceRecords.length, uniqueRecords))
  }

  // ---- 买卖量 ----
  const volumeFiles: string[] = []
  const volumeSeries: {
    symbol: string
    volumeRev: number
    intervals: VolumeIntervalImport[]
  }[] = []
  const volumeShardWrites: string[] = []
  let volumeBarsImported = 0

  for (const symbol of CLOUDTRADE_OPTION_SYMBOLS) {
    const volumeSource = readCloudtradeVolume(options.cloudtradeHome, symbol)
    volumeFiles.push(volumeSource.path)
    const intervals: VolumeIntervalImport[] = []

    for (const [intervalName, bars] of volumeSource.intervals) {
      let interval: VolumeInterval
      try {
        interval = parseVolumeInterval(intervalName)
      } catch {
        // 源文件里出现未知周期时跳过，不影响已知周期导入。
        continue
      }
      if (bars.length === 0) {
        continue
      }

      const records: LegacyVolumeBarRecord[] = bars.map((bar) => ({
        schemaVersion: 1,
        source: 'cloudtrade',
        symbol: volumeSource.binanceSymbol,
        interval,
        openTime: bar[0] * 1000,
        buyVolume: bar[1],
        sellVolume: bar[2],
        turnover: bar[3],
        sourceRevision: volumeSource.volumeRev,
      }))

      const appends = store.append({
        stream: `${LEGACY_VOLUME_STREAM_PREFIX}/${volumeSource.binanceSymbol}/${interval}`,
        rows: records,
        dayOf: (row) => row.openTime,
        dedupeKey: (row) => String(row.openTime),
      })
      volumeShardWrites.push(...appends.map((append) => append.path))
      volumeBarsImported += appends.reduce((sum, append) => sum + append.appended, 0)

      intervals.push({
        interval,
        bars: records.length,
        firstOpenTime: records[0].openTime,
        lastOpenTime: records[records.length - 1].openTime,
      })
    }

    volumeSeries.push({
      symbol: volumeSource.binanceSymbol,
      volumeRev: volumeSource.volumeRev,
      intervals,
    })
  }

  const manifest: MigrationManifest = {
    schemaVersion: 1,
    generatedAt,
    cloudtradeHome: options.cloudtradeHome,
    outputRoot: options.rootDir,
    options: {
      files: optionSource.files,
      recordsImported: optionRecordsImported,
      duplicatesDropped,
      skippedNonTargetRecords: optionSource.skippedNonTargetRecords,
      cadence,
    },
    volume: {
      files: volumeFiles,
      barsImported: volumeBarsImported,
      series: volumeSeries,
    },
    caveats: MIGRATION_CAVEATS,
  }

  const manifestPath = join(options.rootDir, LEGACY_DIR_NAME, MANIFEST_FILE_NAME)
  writeJsonAtomic(manifestPath, manifest)

  return {
    manifest,
    manifestPath,
    optionShardWrites: optionShardWrites.length,
    volumeShardWrites: volumeShardWrites.length,
  }
}
