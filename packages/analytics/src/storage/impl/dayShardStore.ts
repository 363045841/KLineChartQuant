/**
 * 按天 gzip 分片存储实现。
 *
 * 写入采用「读回当天分片 → 按去重键合并 → 原子替换」：分片是按天聚合的小文件
 * （期权聚合位约 1MB/天、买卖量约 300KB/天），重写成本远低于维护增量索引的复杂度，
 * 同时天然保证重复采集不会产生重复行。
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { ANALYTICS_ERROR_CODES, AnalyticsError, toError } from '../../errors'
import type { DayAppendRequest, DayAppendResult, DayShardStore } from '../types'

/** 分片文件名：`YYYY-MM-DD.jsonl.gz`。 */
const SHARD_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}\.jsonl\.gz$/

/** 分片后缀。 */
const SHARD_SUFFIX = '.jsonl.gz'

/** 流标识每段允许的字符。 */
const STREAM_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/

/** 毫秒时间戳 → UTC 日期。 */
function toUtcDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

/**
 * 把流标识解析为目录路径，并挡住路径穿越。
 *
 * @param rootDir 存储根目录
 * @param stream 流标识
 * @returns 流目录绝对路径
 * @throws AnalyticsError 流标识为空段、包含 `..` 或非法字符
 */
function resolveStreamDir(rootDir: string, stream: string): string {
  const segments = stream.split('/')
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new AnalyticsError(
        ANALYTICS_ERROR_CODES.STORAGE_STREAM_INVALID,
        `流标识含非法路径段：${stream}`,
        { stream },
      )
    }
    if (!STREAM_SEGMENT_PATTERN.test(segment)) {
      throw new AnalyticsError(
        ANALYTICS_ERROR_CODES.STORAGE_STREAM_INVALID,
        `流标识含非法字符：${stream}`,
        { stream, segment },
      )
    }
  }
  return resolve(rootDir, ...segments)
}

/** 分片文件路径。 */
function shardPath(streamDir: string, day: string): string {
  return join(streamDir, `${day}${SHARD_SUFFIX}`)
}

/**
 * 读取分片原始行；文件不存在时返回空数组。
 *
 * @param path 分片绝对路径
 * @param stream 流标识（仅用于错误上下文）
 * @param day 日期（仅用于错误上下文）
 * @returns 行文本数组
 * @throws AnalyticsError 分片无法解压
 */
function readShardLines(path: string, stream: string, day: string): string[] {
  if (!existsSync(path)) {
    return []
  }
  let text: string
  try {
    // gzip 支持多成员，历史分片即便追加过也能一次读完。
    text = gunzipSync(readFileSync(path)).toString('utf8')
  } catch (error) {
    throw new AnalyticsError(ANALYTICS_ERROR_CODES.STORAGE_READ_INVALID, `分片解压失败：${path}`, {
      stream,
      day,
      cause: toError(error).message,
    })
  }
  return text.split('\n').filter((line) => line !== '')
}

/**
 * 原子写入分片：先写临时文件再重命名，避免中断留下半截分片。
 *
 * @param path 目标分片路径
 * @param lines 完整行集合
 * @param stream 流标识（仅用于错误上下文）
 * @param day 日期（仅用于错误上下文）
 * @throws AnalyticsError 写入或压缩失败
 */
function writeShardLines(
  path: string,
  lines: readonly string[],
  stream: string,
  day: string,
): void {
  const payload = lines.length === 0 ? '' : `${lines.join('\n')}\n`
  const tempPath = `${path}.tmp-${process.pid}`
  try {
    writeFileSync(tempPath, gzipSync(Buffer.from(payload, 'utf8')))
    renameSync(tempPath, path)
  } catch (error) {
    throw new AnalyticsError(ANALYTICS_ERROR_CODES.STORAGE_WRITE_FAILED, `分片写入失败：${path}`, {
      stream,
      day,
      cause: toError(error).message,
    })
  }
}

/**
 * 创建按天分片存储。
 *
 * @param rootDir 存储根目录（桌面端 userData 下的分析数据目录）
 * @returns 分片存储实例
 */
export function createDayShardStore(rootDir: string): DayShardStore {
  return {
    append<T>(request: DayAppendRequest<T>): readonly DayAppendResult[] {
      const streamDir = resolveStreamDir(rootDir, request.stream)
      mkdirSync(streamDir, { recursive: true })

      // 先按天分组，一次追加可能跨天（例如拉回最近 500 根 1m K 线会跨两天）。
      const rowsByDay = new Map<string, T[]>()
      for (const row of request.rows) {
        const day = toUtcDay(request.dayOf(row))
        const bucket = rowsByDay.get(day)
        if (bucket === undefined) {
          rowsByDay.set(day, [row])
          continue
        }
        bucket.push(row)
      }

      const results: DayAppendResult[] = []
      for (const [day, rows] of [...rowsByDay.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      )) {
        const path = shardPath(streamDir, day)
        const existingLines = readShardLines(path, request.stream, day)
        const existingKeys = new Set<string>()
        for (const line of existingLines) {
          const parsed: unknown = JSON.parse(line)
          existingKeys.add(request.dedupeKey(parsed as T))
        }

        const appendedLines: string[] = []
        for (const row of rows) {
          const key = request.dedupeKey(row)
          if (existingKeys.has(key)) {
            continue
          }
          existingKeys.add(key)
          appendedLines.push(JSON.stringify(row))
        }

        const skipped = rows.length - appendedLines.length
        if (appendedLines.length > 0) {
          writeShardLines(path, [...existingLines, ...appendedLines], request.stream, day)
        }
        results.push({
          stream: request.stream,
          day,
          appended: appendedLines.length,
          skipped,
          path,
        })
      }
      return results
    },

    read<T>(request: { readonly stream: string; readonly day: string }): readonly T[] {
      const streamDir = resolveStreamDir(rootDir, request.stream)
      const path = shardPath(streamDir, request.day)
      const lines = readShardLines(path, request.stream, request.day)
      return lines.map((line, index) => {
        try {
          return JSON.parse(line) as T
        } catch (error) {
          throw new AnalyticsError(
            ANALYTICS_ERROR_CODES.STORAGE_READ_INVALID,
            `分片第 ${index + 1} 行不是合法 JSON：${path}`,
            { stream: request.stream, day: request.day, cause: toError(error).message },
          )
        }
      })
    },

    listDays(stream: string): readonly string[] {
      const streamDir = resolveStreamDir(rootDir, stream)
      if (!existsSync(streamDir)) {
        return []
      }
      return readdirSync(streamDir)
        .filter((name) => SHARD_FILE_PATTERN.test(name))
        .map((name) => name.slice(0, name.length - SHARD_SUFFIX.length))
        .sort()
    },

    purgeBefore(request: {
      readonly stream: string
      readonly beforeDay: string
    }): readonly string[] {
      const streamDir = resolveStreamDir(rootDir, request.stream)
      if (!existsSync(streamDir)) {
        return []
      }
      const removed: string[] = []
      for (const name of readdirSync(streamDir)) {
        if (!SHARD_FILE_PATTERN.test(name)) {
          continue
        }
        const day = name.slice(0, name.length - SHARD_SUFFIX.length)
        if (day >= request.beforeDay) {
          continue
        }
        unlinkSync(join(streamDir, name))
        removed.push(day)
      }
      return removed.sort()
    },
  }
}
