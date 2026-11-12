/**
 * cloudtrade 源文件读取。
 *
 * 两类来源：
 * - 期权聚合位：`archive/option_levels_history_YYYYMMDD.jsonl.gz`（每行一个 JSON）与
 *   当前追加文件 `option_levels_history.jsonl`
 * - 买卖量：`volume/{BTCUSD,ETHUSD}.json`，结构为
 *   `{ symbol, binance_symbol, volume_rev, intervals: { 1m: { bars: [[秒级时间戳, 买量, 卖量, 成交额]] } } }`
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { ANALYTICS_ERROR_CODES, AnalyticsError, toError } from '../../errors'
import {
  CLOUDTRADE_OPTION_SYMBOLS,
  type CloudtradeOptionRecord,
  type CloudtradeOptionSource,
  type CloudtradeVolumeSource,
} from '../types'

/** 归档文件名格式。 */
const ARCHIVE_FILE_PATTERN = /^option_levels_history_\d{8}\.jsonl\.gz$/

/** 归档子目录。 */
const ARCHIVE_DIR_NAME = 'archive'

/** 当前追加文件。 */
const CURRENT_LEVELS_FILE_NAME = 'option_levels_history.jsonl'

/** 买卖量子目录。 */
const VOLUME_DIR_NAME = 'volume'

/**
 * 判断值是否为普通对象。
 *
 * @param value 任意值
 * @returns 是否对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 读取可选数字字段：缺失或 null 返回 null，类型不符抛错。
 *
 * @param record 原始记录
 * @param key 字段名
 * @param context 错误上下文
 * @returns 数字或 null
 * @throws AnalyticsError 字段类型非法
 */
function readOptionalNumber(
  record: Record<string, unknown>,
  key: string,
  context: string,
): number | null {
  const value = record[key]
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.CLOUDTRADE_RECORD_INVALID,
      `${context} 的 ${key} 不是有限数字`,
      { context, key, valueType: typeof value },
    )
  }
  return value
}

/**
 * 读取必填字符串字段。
 *
 * @param record 原始记录
 * @param key 字段名
 * @param context 错误上下文
 * @returns 字符串
 * @throws AnalyticsError 字段缺失或类型非法
 */
function readRequiredText(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value === '') {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.CLOUDTRADE_RECORD_INVALID,
      `${context} 的 ${key} 不是非空字符串`,
      { context, key, valueType: typeof value },
    )
  }
  return value
}

/**
 * 把一行 JSON 转成 cloudtrade 期权记录；非目标符号返回 null。
 *
 * @param line 原始行
 * @param context 错误上下文（文件路径 + 行号）
 * @returns 记录；非目标符号时为 null
 * @throws AnalyticsError JSON 非法或字段类型不符
 */
function parseOptionLine(line: string, context: string): CloudtradeOptionRecord | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch (error) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.CLOUDTRADE_RECORD_INVALID,
      `${context} 不是合法 JSON`,
      { context, cause: toError(error).message },
    )
  }
  if (!isRecord(parsed)) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.CLOUDTRADE_RECORD_INVALID,
      `${context} 不是对象`,
      { context },
    )
  }

  const symbol = readRequiredText(parsed, 'symbol', context)
  if (!CLOUDTRADE_OPTION_SYMBOLS.includes(symbol)) {
    return null
  }

  const src = parsed.src
  return {
    symbol,
    ts: readRequiredText(parsed, 'ts', context),
    src: typeof src === 'string' && src !== '' ? src : null,
    gammaFlip: readOptionalNumber(parsed, 'gamma_flip', context),
    callWall: readOptionalNumber(parsed, 'call_wall', context),
    putWall: readOptionalNumber(parsed, 'put_wall', context),
    maxPain: readOptionalNumber(parsed, 'max_pain', context),
    spot: readOptionalNumber(parsed, 'spot', context),
  }
}

/**
 * 读取 cloudtrade 期权聚合位历史。
 *
 * @param cloudtradeHome cloudtrade 数据根目录（通常是 `~/.cloudtrade`）
 * @returns 目标符号记录、读取过的文件与非目标记录数
 * @throws AnalyticsError 源目录/文件缺失或记录非法
 */
export function readCloudtradeOptionLevels(cloudtradeHome: string): CloudtradeOptionSource {
  const files: string[] = []
  const records: CloudtradeOptionRecord[] = []
  let skippedNonTargetRecords = 0

  const archiveDir = join(cloudtradeHome, ARCHIVE_DIR_NAME)
  if (existsSync(archiveDir)) {
    const archiveFiles = readdirSync(archiveDir)
      .filter((name) => ARCHIVE_FILE_PATTERN.test(name))
      .sort()
    for (const name of archiveFiles) {
      const path = join(archiveDir, name)
      files.push(path)
      let text: string
      try {
        text = gunzipSync(readFileSync(path)).toString('utf8')
      } catch (error) {
        throw new AnalyticsError(
          ANALYTICS_ERROR_CODES.CLOUDTRADE_RECORD_INVALID,
          `归档文件无法解压：${path}`,
          { path, cause: toError(error).message },
        )
      }
      appendRecords(text, path, records, (count) => {
        skippedNonTargetRecords += count
      })
    }
  }

  const currentPath = join(cloudtradeHome, CURRENT_LEVELS_FILE_NAME)
  if (existsSync(currentPath)) {
    files.push(currentPath)
    appendRecords(readFileSync(currentPath, 'utf8'), currentPath, records, (count) => {
      skippedNonTargetRecords += count
    })
  }

  if (files.length === 0) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.CLOUDTRADE_SOURCE_MISSING,
      `找不到 cloudtrade 期权历史文件：${cloudtradeHome}`,
      { cloudtradeHome },
    )
  }

  return { files, records, skippedNonTargetRecords }
}

/**
 * 把一段 JSONL 文本里的记录追加到结果集。
 *
 * @param text JSONL 文本
 * @param path 文件绝对路径
 * @param records 结果集（就地追加）
 * @param addSkipped 累加非目标记录数的回调
 */
function appendRecords(
  text: string,
  path: string,
  records: CloudtradeOptionRecord[],
  addSkipped: (count: number) => void,
): void {
  const lines = text.split('\n')
  let skipped = 0
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (line === '') {
      continue
    }
    const record = parseOptionLine(line, `${path}:${index + 1}`)
    if (record === null) {
      skipped += 1
      continue
    }
    records.push(record)
  }
  addSkipped(skipped)
}

/**
 * 读取单个 cloudtrade 买卖量文件。
 *
 * @param cloudtradeHome cloudtrade 数据根目录
 * @param symbol 来源符号（`BTCUSD` / `ETHUSD`）
 * @returns 解析后的买卖量来源
 * @throws AnalyticsError 文件缺失或结构非法
 */
export function readCloudtradeVolume(
  cloudtradeHome: string,
  symbol: string,
): CloudtradeVolumeSource {
  const path = join(cloudtradeHome, VOLUME_DIR_NAME, `${symbol}.json`)
  if (!existsSync(path)) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.CLOUDTRADE_SOURCE_MISSING,
      `找不到 cloudtrade 买卖量文件：${path}`,
      { path },
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.CLOUDTRADE_RECORD_INVALID,
      `买卖量文件不是合法 JSON：${path}`,
      { path, cause: toError(error).message },
    )
  }
  if (!isRecord(parsed)) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.CLOUDTRADE_RECORD_INVALID,
      `买卖量文件根节点不是对象：${path}`,
      { path },
    )
  }

  const binanceSymbol = readRequiredText(parsed, 'binance_symbol', path)
  const volumeRevValue = parsed.volume_rev
  if (typeof volumeRevValue !== 'number' || !Number.isFinite(volumeRevValue)) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.CLOUDTRADE_RECORD_INVALID,
      `买卖量文件缺少合法的 volume_rev：${path}`,
      { path },
    )
  }
  const updatedAtValue = parsed.updated_at
  const updatedAt =
    typeof updatedAtValue === 'number' && Number.isFinite(updatedAtValue) ? updatedAtValue : 0

  const intervalsRaw = parsed.intervals
  if (!isRecord(intervalsRaw)) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.CLOUDTRADE_RECORD_INVALID,
      `买卖量文件缺少 intervals：${path}`,
      { path },
    )
  }

  const intervals = new Map<string, readonly (readonly number[])[]>()
  for (const [interval, value] of Object.entries(intervalsRaw)) {
    if (!isRecord(value)) {
      throw new AnalyticsError(
        ANALYTICS_ERROR_CODES.CLOUDTRADE_RECORD_INVALID,
        `买卖量 ${interval} 不是对象：${path}`,
        { path, interval },
      )
    }
    const bars = value.bars
    if (!Array.isArray(bars)) {
      throw new AnalyticsError(
        ANALYTICS_ERROR_CODES.CLOUDTRADE_RECORD_INVALID,
        `买卖量 ${interval} 缺少 bars 数组：${path}`,
        { path, interval },
      )
    }
    intervals.set(
      interval,
      bars.map((bar, index) => parseBar(bar, `${path}:${interval}[${index}]`)),
    )
  }

  return { path, symbol, binanceSymbol, volumeRev: volumeRevValue, updatedAt, intervals }
}

/**
 * 校验一根柱的四个字段。
 *
 * @param bar 原始柱
 * @param context 错误上下文
 * @returns 四元组
 * @throws AnalyticsError 结构非法
 */
function parseBar(bar: unknown, context: string): readonly number[] {
  if (!Array.isArray(bar) || bar.length < 4) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.CLOUDTRADE_RECORD_INVALID,
      `${context} 不是四元组`,
      { context, length: Array.isArray(bar) ? bar.length : null },
    )
  }
  const values: number[] = []
  for (let index = 0; index < 4; index += 1) {
    const value = bar[index]
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new AnalyticsError(
        ANALYTICS_ERROR_CODES.CLOUDTRADE_RECORD_INVALID,
        `${context} 第 ${index} 个值不是有限数字`,
        { context, index },
      )
    }
    values.push(value)
  }
  return values
}
