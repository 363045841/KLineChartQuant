/**
 * 数据装载：K 线、期权关键位、as-of 对齐。
 *
 * 数据来源：
 * - K 线：优先读 `temp/ichimoku-filter-eval/cache/{SYMBOL}-1h.json`（task-3 缓存）；
 *   缺失时从 Binance REST 分页拉取并回写缓存。
 * - 期权关键位：正式数据目录 `%APPDATA%\KLineChart Quant\analytics` 下的
 *   `legacy/options-levels/{BTCUSD|ETHUSD}`（迁移自 cloudtrade，约 39 天）与
 *   `options/aggregate/{BTC|ETH}`（本机实时采集）。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import type { Candle } from '../types'

/** 周期毫秒数。 */
export const INTERVAL_MS: Readonly<Record<string, number>> = {
  '1h': 3_600_000,
  '4h': 14_400_000,
}

/** 期权快照：时刻 + 关键位（Gamma 翻转 / Call 墙 / Put 墙 / 最大痛点）。 */
export interface OptionSnapshot {
  /** 采集时刻（毫秒） */
  readonly ts: number
  /** 关键位列表（已过滤非正与缺失值） */
  readonly levels: readonly number[]
}

/** 期权 as-of 回看上限：超过则视为无覆盖。 */
export const OPTION_LOOKBACK_MS = 26 * 3_600_000

/** Binance REST 基址。 */
const BINANCE_BASE = 'https://api.binance.com/api/v3/klines'

/** 单次拉取上限。 */
const BINANCE_LIMIT = 1000

/** 从 2017-08-17 起拉取（BTCUSDT 上线日）。 */
const HISTORY_START = Date.UTC(2017, 7, 17, 0, 0, 0)

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
 * 从缓存读取 K 线，只保留已收盘的 bar。
 *
 * @param cacheDir 缓存目录
 * @param symbol 交易对
 * @param timeframe 周期
 * @returns 已收盘 K 线
 * @throws Error 缓存文件缺失或格式不符
 */
export function loadCandlesFromCache(
  cacheDir: string,
  symbol: string,
  timeframe: string,
): Candle[] {
  const path = join(cacheDir, `${symbol}-${timeframe}.json`)
  if (!existsSync(path)) {
    throw new Error(`缺少 K 线缓存：${path}（先运行抓取或使用 --fetch）`)
  }
  const step = INTERVAL_MS[timeframe]
  if (step === undefined) {
    throw new Error(`不支持的周期：${timeframe}`)
  }
  const payload: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isRecord(payload) || !Array.isArray(payload.bars)) {
    throw new Error(`K 线缓存格式不符：${path}`)
  }
  const bars: unknown[] = payload.bars
  const now = Date.now()
  const candles: Candle[] = []
  for (const row of bars) {
    if (!Array.isArray(row) || row.length < 6) {
      throw new Error(`K 线缓存存在异常行：${path}`)
    }
    const openTime = Number(row[0])
    const open = Number(row[1])
    const high = Number(row[2])
    const low = Number(row[3])
    const close = Number(row[4])
    const volume = Number(row[5])
    if (
      !Number.isFinite(openTime) ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close) ||
      !Number.isFinite(volume)
    ) {
      throw new Error(`K 线缓存存在非数字字段：${path}`)
    }
    const closeTime = openTime + step - 1
    // 与评估脚本一致：未收盘的 bar 不参与统计。
    if (closeTime >= now) {
      continue
    }
    candles.push({ openTime, closeTime, open, high, low, close, volume })
  }
  return candles
}

/**
 * 从 Binance REST 拉取全历史 K 线（分页），并写入缓存。
 *
 * @param cacheDir 缓存目录
 * @param symbol 交易对
 * @param timeframe 周期
 * @returns 已收盘 K 线
 */
export async function fetchCandles(
  cacheDir: string,
  symbol: string,
  timeframe: string,
): Promise<Candle[]> {
  const step = INTERVAL_MS[timeframe]
  if (step === undefined) {
    throw new Error(`不支持的周期：${timeframe}`)
  }
  const bars: unknown[][] = []
  let startTime = HISTORY_START
  const now = Date.now()

  for (;;) {
    const url = `${BINANCE_BASE}?symbol=${symbol}&interval=${timeframe}&limit=${BINANCE_LIMIT}&startTime=${startTime}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`拉取 K 线失败：HTTP ${response.status} ${symbol} ${timeframe}`)
    }
    const payload: unknown = await response.json()
    if (!Array.isArray(payload) || payload.length === 0) {
      break
    }
    const rows: unknown[] = payload
    for (const row of rows) {
      if (!Array.isArray(row)) {
        throw new Error(`K 线存在非数组行：${symbol} ${timeframe}`)
      }
      bars.push(row)
    }
    const lastRow = rows[rows.length - 1]
    const lastOpen = Array.isArray(lastRow) ? Number(lastRow[0]) : Number.NaN
    if (!Number.isFinite(lastOpen)) {
      throw new Error(`K 线末行缺少开盘时间：${symbol} ${timeframe}`)
    }
    if (rows.length < BINANCE_LIMIT || lastOpen + step > now) {
      break
    }
    startTime = lastOpen + step
    await new Promise((resolve) => setTimeout(resolve, 60))
  }

  mkdirSync(cacheDir, { recursive: true })
  const path = join(cacheDir, `${symbol}-${timeframe}.json`)
  writeFileSync(
    path,
    JSON.stringify({ symbol, interval: timeframe, fetchedAt: Date.now(), bars }),
    'utf8',
  )
  return loadCandlesFromCache(cacheDir, symbol, timeframe)
}

/**
 * 读取一个流目录下的全部 gz 分片。
 *
 * @param dir 流目录
 * @returns 每行的 JSON 对象
 */
function readShardLines(dir: string): unknown[] {
  if (!existsSync(dir)) {
    return []
  }
  const records: unknown[] = []
  for (const name of readdirSync(dir)
    .filter((file) => file.endsWith('.jsonl.gz'))
    .sort()) {
    const text = gunzipSync(readFileSync(join(dir, name))).toString('utf8')
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue
      records.push(JSON.parse(line))
    }
  }
  return records
}

/**
 * 读取某个品种的期权关键位时间线（legacy 迁移 + 实时聚合位）。
 *
 * @param optionRoot 正式数据目录（`.../analytics`）
 * @param currency 品种（`BTC` / `ETH`）
 * @returns 按时间升序、按时刻去重的快照
 */
export function loadOptionSnapshots(optionRoot: string, currency: 'BTC' | 'ETH'): OptionSnapshot[] {
  const sourceSymbol = currency === 'BTC' ? 'BTCUSD' : 'ETHUSD'
  const collected: OptionSnapshot[] = []

  const push = (ts: unknown, levels: readonly unknown[]): void => {
    if (typeof ts !== 'number' || !Number.isFinite(ts)) return
    const clean = levels.filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0,
    )
    collected.push({ ts, levels: clean })
  }

  // legacy：迁移自 cloudtrade 的历史聚合位
  for (const record of readShardLines(join(optionRoot, 'legacy', 'options-levels', sourceSymbol))) {
    if (!isRecord(record)) continue
    push(record.capturedAt, [
      record.gammaFlipUsd,
      record.callWallUsd,
      record.putWallUsd,
      record.maxPainUsd,
    ])
  }

  // 实时：本机采集的聚合位（字段结构略有差异：墙位是对象）
  for (const record of readShardLines(join(optionRoot, 'options', 'aggregate', currency))) {
    if (!isRecord(record)) continue
    const callWall = isRecord(record.callWall) ? record.callWall.strike : undefined
    const putWall = isRecord(record.putWall) ? record.putWall.strike : undefined
    push(record.capturedAt, [record.gammaFlipUsd, callWall, putWall, record.maxPainUsd])
  }

  const byTs = new Map<number, OptionSnapshot>()
  for (const snapshot of collected) {
    byTs.set(snapshot.ts, snapshot)
  }
  return [...byTs.values()].sort((left, right) => left.ts - right.ts)
}

/**
 * 取某时刻之前最近一条期权快照的关键位。
 *
 * @param snapshots 按时间升序的快照
 * @param timeMs 目标时刻（毫秒）
 * @param lookbackMs 回看上限
 * @returns 关键位；无覆盖返回 null
 */
export function optionLevelsAt(
  snapshots: readonly OptionSnapshot[],
  timeMs: number,
  lookbackMs: number = OPTION_LOOKBACK_MS,
): readonly number[] | null {
  let low = 0
  let high = snapshots.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (snapshots[middle].ts <= timeMs) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  if (found < 0) {
    return null
  }
  const snapshot = snapshots[found]
  if (timeMs - snapshot.ts > lookbackMs) {
    return null
  }
  return snapshot.levels
}
