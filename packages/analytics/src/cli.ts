#!/usr/bin/env node
/**
 * 分析数据采集器命令行。
 *
 * 子命令：
 * - `collect-options`：拉 Deribit BTC/ETH 期权链 → 算聚合位 → 落盘 → 读回校验 → 滚上
 * - `backfill-options`：从已落盘的分钟分片补齐小时行与日行（幂等，可反复跑）
 * - `collect-volume`：拉 Binance K 线买卖量 → 守恒断言 → 落盘 → 读回校验
 * - `migrate-cloudtrade`：把 cloudtrade 历史导入 `legacy/` 子树
 *
 * 默认数据目录是桌面端 userData 下的 `analytics/`：与图表数据通路完全分离。
 * Deribit 在本机必须走代理（默认 `127.0.0.1:7078`），失败时直接报错，不重试到天荒地老。
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ANALYTICS_ERROR_CODES, AnalyticsError, toError } from './errors'
import { migrateCloudtradeData } from './migration/impl/migrate'
import { createNodeHttpsClient } from './net/impl/nodeHttpsClient'
import type { ProxyEndpoint } from './net/types'
import { createBinanceOptionsClient } from './options/impl/binance'
import { type CollectedOptionCurrency, collectOptionCurrencies } from './options/impl/collect'
import { createDeribitClient } from './options/impl/deribit'
import { pruneLegacyOptionsLevels } from './options/impl/legacyPrune'
import { purgeOptionStreams, retentionCutoffDay } from './options/impl/retention'
import { rollupOptionDays } from './options/impl/rollup'
import {
  OPTION_CHAIN_RETENTION_DAYS,
  OPTION_CURRENCIES,
  type OptionCurrency,
} from './options/types'
import { persistOrderflowPanel } from './orderflow/impl/collect'
import { collectTradeBuckets } from './orderflow/impl/collectTrades'
import { createFlowClient } from './orderflow/impl/flowVenues'
import { createPanelClient } from './orderflow/impl/panel'
import { ORDERFLOW_VENUES, type OrderflowVenue } from './orderflow/types'
import { DEFAULT_ORDERFLOW_PORT, startOrderflowServer } from './serve/impl/server'
import { createDayShardStore } from './storage/impl/dayShardStore'
import type { DayShardStore } from './storage/types'
import {
  createBinanceClient,
  DEFAULT_VOLUME_SYMBOLS,
  parseVolumeInterval,
} from './volume/impl/binance'
import { collectVolumeSeries } from './volume/impl/collect'
import {
  VOLUME_PERMANENT_INTERVALS,
  VOLUME_SHORT_INTERVAL_RETENTION_DAYS,
  type VolumeInterval,
} from './volume/types'

/** 桌面端产品名：决定 userData 目录名，与 electron-builder 的 productName 一致。 */
const DESKTOP_PRODUCT_NAME = 'KLineChart Quant'

/** 分析数据子目录名。 */
const ANALYTICS_DIR_NAME = 'analytics'

/** Deribit 代理默认主机（本机 MonoCloud）。 */
const DEFAULT_PROXY_HOST = '127.0.0.1'

/** Deribit 代理默认端口。 */
const DEFAULT_PROXY_PORT = 7078

/** 默认采集的 K 线周期。 */
const DEFAULT_VOLUME_INTERVALS: readonly VolumeInterval[] = ['1m', '5m', '15m', '1h', '4h', '1d']

/** 默认拉取的 K 线根数。 */
const DEFAULT_KLINE_LIMIT = 500

/** 默认采集订单流的交易对。 */
const DEFAULT_ORDERFLOW_SYMBOLS: readonly string[] = ['BTCUSDT', 'ETHUSDT']

/** 默认采集订单流的交易所。 */
const DEFAULT_ORDERFLOW_VENUES: readonly OrderflowVenue[] = ORDERFLOW_VENUES

/** 一天的毫秒数。 */
const MS_PER_DAY = 86_400_000

/** 未指定 `--repeat-seconds` 时的行为标记。 */
const NO_REPEAT = null

/** 已解析的命令行参数。 */
interface ParsedArguments {
  /** 子命令 */
  readonly command: string
  /** 参数表：`--key value` 存字符串，`--flag` 存 true */
  readonly flags: ReadonlyMap<string, string | true>
}

/**
 * 解析命令行参数。
 *
 * @param argv 进程参数（不含 node 与脚本路径）
 * @returns 子命令与参数表
 * @throws AnalyticsError 缺少值或出现重复参数
 */
function parseArguments(argv: readonly string[]): ParsedArguments {
  const command = argv[0] ?? 'help'
  const flags = new Map<string, string | true>()

  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      throw new AnalyticsError(ANALYTICS_ERROR_CODES.ARGUMENT_INVALID, `无法识别的参数：${token}`, {
        token,
      })
    }
    const name = token.slice(2)
    if (name === '') {
      throw new AnalyticsError(ANALYTICS_ERROR_CODES.ARGUMENT_INVALID, '出现了空参数名')
    }
    if (flags.has(name)) {
      throw new AnalyticsError(ANALYTICS_ERROR_CODES.ARGUMENT_INVALID, `参数重复：--${name}`, {
        name,
      })
    }
    const next = argv[index + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(name, next)
      index += 1
      continue
    }
    flags.set(name, true)
  }

  return { command, flags }
}

/**
 * 读取字符串参数。
 *
 * @param parsed 已解析参数
 * @param name 参数名
 * @param fallback 缺省值
 * @returns 参数值
 * @throws AnalyticsError 参数缺少值
 */
function readStringFlag(parsed: ParsedArguments, name: string, fallback: string): string {
  const value = parsed.flags.get(name)
  if (value === undefined) {
    return fallback
  }
  if (value === true) {
    throw new AnalyticsError(ANALYTICS_ERROR_CODES.ARGUMENT_INVALID, `参数 --${name} 需要一个值`, {
      name,
    })
  }
  return value
}

/**
 * 读取可选字符串参数。
 *
 * @param parsed 已解析参数
 * @param name 参数名
 * @returns 参数值；未提供时为 null
 * @throws AnalyticsError 参数缺少值
 */
function readOptionalStringFlag(parsed: ParsedArguments, name: string): string | null {
  const value = parsed.flags.get(name)
  if (value === undefined) {
    return null
  }
  if (value === true) {
    throw new AnalyticsError(ANALYTICS_ERROR_CODES.ARGUMENT_INVALID, `参数 --${name} 需要一个值`, {
      name,
    })
  }
  return value
}

/**
 * 读取数字参数。
 *
 * @param parsed 已解析参数
 * @param name 参数名
 * @param fallback 缺省值
 * @returns 数值
 * @throws AnalyticsError 参数不是有限数字
 */
function readNumberFlag(parsed: ParsedArguments, name: string, fallback: number): number {
  const raw = readOptionalStringFlag(parsed, name)
  if (raw === null) {
    return fallback
  }
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.ARGUMENT_INVALID,
      `参数 --${name} 不是数字：${raw}`,
      { name, raw },
    )
  }
  return value
}

/**
 * 读取布尔开关。
 *
 * @param parsed 已解析参数
 * @param name 参数名
 * @returns 是否出现
 * @throws AnalyticsError 开关被赋了值
 */
function readBooleanFlag(parsed: ParsedArguments, name: string): boolean {
  const value = parsed.flags.get(name)
  if (value === undefined) {
    return false
  }
  if (value !== true) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.ARGUMENT_INVALID,
      `参数 --${name} 是开关，不需要值`,
      { name },
    )
  }
  return true
}

/**
 * 读取逗号分隔列表参数。
 *
 * @param parsed 已解析参数
 * @param name 参数名
 * @param fallback 缺省列表
 * @returns 去空白后的字符串数组
 * @throws AnalyticsError 列表为空
 */
function readListFlag(
  parsed: ParsedArguments,
  name: string,
  fallback: readonly string[],
): readonly string[] {
  const raw = readOptionalStringFlag(parsed, name)
  if (raw === null) {
    return fallback
  }
  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
  if (items.length === 0) {
    throw new AnalyticsError(ANALYTICS_ERROR_CODES.ARGUMENT_INVALID, `参数 --${name} 为空`, {
      name,
    })
  }
  return items
}

/**
 * 解析代理参数。
 *
 * @param parsed 已解析参数
 * @param fallback 缺省代理；null 表示直连
 * @returns 代理端点或 null
 * @throws AnalyticsError 格式非法
 */
function readProxyFlag(
  parsed: ParsedArguments,
  fallback: ProxyEndpoint | null,
): ProxyEndpoint | null {
  const raw = readOptionalStringFlag(parsed, 'proxy')
  if (raw === null) {
    return fallback
  }
  if (raw === 'none') {
    return null
  }
  const separator = raw.lastIndexOf(':')
  if (separator <= 0) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.ARGUMENT_INVALID,
      `代理格式应为 host:port 或 none：${raw}`,
      { raw },
    )
  }
  const host = raw.slice(0, separator)
  const port = Number(raw.slice(separator + 1))
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new AnalyticsError(ANALYTICS_ERROR_CODES.ARGUMENT_INVALID, `代理端口非法：${raw}`, {
      raw,
    })
  }
  return { host, port }
}

/**
 * 计算桌面端 userData 下分析数据目录。
 *
 * Electron 的 `app.getPath('userData')` 在各平台的取值：
 * Windows `%APPDATA%/<产品名>`、macOS `~/Library/Application Support/<产品名>`、
 * Linux `~/.config/<产品名>`。这里按平台显式映射，不做猜测式回退。
 *
 * @returns 分析数据根目录
 * @throws AnalyticsError 平台缺少必要环境变量
 */
function defaultRootDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    if (appData === undefined || appData === '') {
      throw new AnalyticsError(
        ANALYTICS_ERROR_CODES.ARGUMENT_INVALID,
        '环境变量 APPDATA 缺失，请显式传 --root',
      )
    }
    return join(appData, DESKTOP_PRODUCT_NAME, ANALYTICS_DIR_NAME)
  }
  if (process.platform === 'darwin') {
    return join(
      homedir(),
      'Library',
      'Application Support',
      DESKTOP_PRODUCT_NAME,
      ANALYTICS_DIR_NAME,
    )
  }
  return join(homedir(), '.config', DESKTOP_PRODUCT_NAME, ANALYTICS_DIR_NAME)
}

/**
 * 取数据根目录。
 *
 * @param parsed 已解析参数
 * @returns 根目录绝对路径
 */
function readRootDir(parsed: ParsedArguments): string {
  const explicit = readOptionalStringFlag(parsed, 'root')
  return explicit === null ? defaultRootDir() : explicit
}

/**
 * 数字加千分位。
 *
 * @param value 数值
 * @param digits 小数位
 * @returns 形如 `74,748.56` 的字符串
 */
function formatNumber(value: number, digits: number): string {
  const fixed = value.toFixed(digits)
  const [integerPart = '0', fractionPart] = fixed.split('.')
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fractionPart === undefined ? grouped : `${grouped}.${fractionPart}`
}

/**
 * 把 USD 金额格式化成百万单位。
 *
 * @param value 数值
 * @returns 形如 `-45.64M` 的字符串
 */
function formatMillions(value: number): string {
  return `${(value / 1_000_000).toFixed(2)}M`
}

/**
 * 格式化墙位，缺持仓时给出明确文案。
 *
 * @param wall 墙位；该视图没有该方向持仓时为 null
 * @returns 形如 `75,000（OI 11,510.3）` 的字符串
 */
function formatStrike(
  wall: { readonly strike: number; readonly openInterest: number } | null,
): string {
  if (wall === null) return '无'
  return `${formatNumber(wall.strike, 0)}（OI ${formatNumber(wall.openInterest, 1)}）`
}

/**
 * 格式化 P/C 持仓比，缺数据时给出明确文案。
 *
 * @param ratio 比值；call 持仓为 0 时为 null
 * @returns 形如 `1.22` 的字符串
 */
function formatRatio(ratio: number | null): string {
  return ratio === null ? '无' : ratio.toFixed(2)
}

/**
 * 计算滚动保留截止日。
 *
 * @param nowMs 当前毫秒
 * @param days 保留天数
 * @returns 截止日（该日之前的全部分片会被删除）
 */
function cutoffDay(nowMs: number, days: number): string {
  return new Date(nowMs - days * MS_PER_DAY).toISOString().slice(0, 10)
}

/**
 * 打印单个标的的期权采集摘要。
 *
 * 近月与全链各打一行：主图口径看近月，全链作为参考与翻转位兜底。
 *
 * @param result 采集结果
 */
function printOptionSummary(result: CollectedOptionCurrency): void {
  const snapshot = result.snapshot
  const near = snapshot.nearTerm
  const all = snapshot.allChain
  const flip =
    snapshot.gammaFlip.gammaFlipUsd === null
      ? '无（累计 GEX 未穿越零轴）'
      : formatNumber(snapshot.gammaFlip.gammaFlipUsd, 1)
  const flipNote = snapshot.gammaFlip.source === 'all-chain' ? '（全链兜底）' : '（近月）'

  console.log(
    `[${snapshot.currency}/${snapshot.venue}] 合约 ${formatNumber(snapshot.chainContractCount, 0)} 张 → 过滤 ${formatNumber(snapshot.filteredContractCount, 0)} 张 | 拉链 ${result.chainElapsedMs}ms | 指数 ${result.indexElapsedMs}ms | 现货 ${formatNumber(snapshot.spotIndex, 2)}`,
  )
  console.log(
    `      翻转位 ${flip}${flipNote} | 近月 ${near.expiryIso} DTE ${formatNumber(near.dteDays, 2)} 天 ATM IV ${formatNumber(near.atmIvPercent, 2)}%`,
  )
  console.log(
    `      近月 净 GEX ${formatMillions(near.netGexUsdPerPercent)} | Call 墙 ${formatStrike(near.callWall)} | Put 墙 ${formatStrike(near.putWall)} | 最大痛点 ${formatNumber(near.maxPainUsd, 0)} | P/C ${formatRatio(near.putCallOiRatio)}`,
  )
  console.log(
    `      全链 净 GEX ${formatMillions(all.netGexUsdPerPercent)} | Call 墙 ${formatStrike(all.callWall)} | Put 墙 ${formatStrike(all.putWall)} | 最大痛点 ${formatNumber(all.maxPainUsd, 0)} | P/C ${formatRatio(all.putCallOiRatio)}`,
  )
  console.log(
    `      ±1σ ${formatNumber(near.expectedMoveOneSigmaUsd, 1)} → [${formatNumber(near.sigmaLowerUsd, 1)}, ${formatNumber(near.sigmaUpperUsd, 1)}] | ±2σ → [${formatNumber(near.sigma2LowerUsd, 1)}, ${formatNumber(near.sigma2UpperUsd, 1)}]`,
  )
  const chainPart =
    result.chainAppend === null
      ? '未落原始链'
      : `原始链 ${result.chainAppend.stream}/${result.chainAppend.day}.jsonl.gz +${result.chainAppend.appended}`
  console.log(
    `      落盘 ${result.aggregateAppend.stream}/${result.aggregateAppend.day}.jsonl.gz +${result.aggregateAppend.appended}（跳过 ${result.aggregateAppend.skipped}）| ${chainPart} | 读回校验 ${result.readBackVerified ? 'OK' : '失败'}`,
  )
}

/**
 * 执行一次或按周期重复执行。
 *
 * @param run 单次任务
 * @param repeatSeconds 重复间隔；null 表示只跑一次
 */
async function runOnceOrRepeat(
  run: () => Promise<void>,
  repeatSeconds: number | null,
): Promise<void> {
  if (repeatSeconds === null) {
    await run()
    return
  }
  if (repeatSeconds <= 0) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.ARGUMENT_INVALID,
      `--repeat-seconds 必须为正数：${repeatSeconds}`,
    )
  }
  console.log(`每 ${repeatSeconds} 秒采集一次，Ctrl+C 退出`)
  for (;;) {
    try {
      await run()
    } catch (error) {
      printError(error)
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, repeatSeconds * 1000)
    })
  }
}

/**
 * 校验并转换期权标的列表。
 *
 * @param names 命令行传入的标的
 * @returns 标的列表
 * @throws AnalyticsError 存在不支持的标的
 */
function parseOptionCurrencies(names: readonly string[]): OptionCurrency[] {
  return names.map((currency) => {
    for (const candidate of OPTION_CURRENCIES) {
      if (candidate === currency) {
        return candidate
      }
    }
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.ARGUMENT_INVALID,
      `不支持的期权标的：${currency}`,
      { currency, supported: OPTION_CURRENCIES },
    )
  })
}

/**
 * 执行期权采集子命令。
 *
 * @param parsed 已解析参数
 */
async function runCollectOptions(parsed: ParsedArguments): Promise<void> {
  const rootDir = readRootDir(parsed)
  const currencies = readListFlag(parsed, 'currencies', OPTION_CURRENCIES)
  const persistChain = readBooleanFlag(parsed, 'with-chain')
  const repeatSeconds =
    readOptionalStringFlag(parsed, 'repeat-seconds') === null
      ? NO_REPEAT
      : readNumberFlag(parsed, 'repeat-seconds', 0)

  const proxy = readProxyFlag(parsed, { host: DEFAULT_PROXY_HOST, port: DEFAULT_PROXY_PORT })
  if (proxy === null) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.ARGUMENT_INVALID,
      '期权采集必须通过代理：Deribit 与 Binance 在本机都会被拦，请用 --proxy host:port 指定',
    )
  }

  const parsedCurrencies = parseOptionCurrencies(currencies)

  const store = createDayShardStore(rootDir)
  const httpClient = createNodeHttpsClient()
  const sources = {
    deribit: createDeribitClient({ httpClient, proxy }),
    binance: createBinanceOptionsClient({ httpClient, proxy }),
  }

  console.log(`数据目录 ${rootDir}`)
  console.log(`代理 ${proxy.host}:${proxy.port}`)

  const run = async (): Promise<void> => {
    const startedAt = Date.now()
    const results = await collectOptionCurrencies({
      sources,
      store,
      currencies: parsedCurrencies,
      persistChain,
      now: () => Date.now(),
    })
    for (const result of results) {
      printOptionSummary(result)
    }
    for (const currency of parsedCurrencies) {
      const rolled = rollupOptionDays({ store, currency, now: () => Date.now() })
      if (rolled.hourRows > 0 || rolled.dayRows > 0) {
        console.log(`[${currency}] 滚上 小时行 +${rolled.hourRows} | 日行 +${rolled.dayRows}`)
      }
    }
    pruneOptionStreams(store, parsedCurrencies, rootDir, startedAt)
    console.log(`本次耗时 ${Date.now() - startedAt}ms`)
  }

  await runOnceOrRepeat(run, repeatSeconds)
}

/**
 * 执行期权滚上回填子命令。
 *
 * 只读分钟分片、写小时行与日行，可重复执行；`--from` 用于指定起点，
 * 省略时自动挑「缺日行的历史分片 + 最近两天」。
 *
 * @param parsed 已解析参数
 */
async function runBackfillOptions(parsed: ParsedArguments): Promise<void> {
  const rootDir = readRootDir(parsed)
  const parsedCurrencies = parseOptionCurrencies(
    readListFlag(parsed, 'currencies', OPTION_CURRENCIES),
  )
  const fromDay = readOptionalStringFlag(parsed, 'from')
  if (fromDay !== null && !/^\d{4}-\d{2}-\d{2}$/.test(fromDay)) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.ARGUMENT_INVALID,
      `--from 需为 YYYY-MM-DD：${fromDay}`,
    )
  }

  const store = createDayShardStore(rootDir)
  console.log(`数据目录 ${rootDir}`)

  for (const currency of parsedCurrencies) {
    const startedAt = Date.now()
    const result = rollupOptionDays({
      store,
      currency,
      now: () => Date.now(),
      fromDay: fromDay ?? undefined,
    })
    const first = result.days[0] ?? '—'
    const last = result.days[result.days.length - 1] ?? '—'
    console.log(
      `[${currency}] 分钟分片 ${result.days.length} 个（${first} → ${last}）| 小时行 +${result.hourRows}（跳过 ${result.skippedHourRows}）| 日行 +${result.dayRows}（跳过 ${result.skippedDayRows}）| ${Date.now() - startedAt}ms`,
    )
  }
}

/**
 * 清理超过保留期的期权分片与旧版关键位文件。
 *
 * 各层保留期不同（见 `options/types.ts` 的保留常量），由 retention 模块统一处理；
 * cloudtrade 时代留下的 `legacy/options-levels` 单独清理。
 *
 * @param store 存储
 * @param currencies 标的列表
 * @param rootDir 数据根目录，用于清理旧版目录
 * @param nowMs 当前毫秒
 */
function pruneOptionStreams(
  store: DayShardStore,
  currencies: readonly OptionCurrency[],
  rootDir: string,
  nowMs: number,
): void {
  for (const result of purgeOptionStreams({ store, currencies, now: () => nowMs })) {
    if (result.days.length === 0) continue
    const beforeDay = retentionCutoffDay(nowMs, result.retentionDays)
    console.log(
      `[${result.stream}] 清理过期分片 ${result.days.length} 个（早于 ${beforeDay}，保留 ${result.retentionDays} 天）`,
    )
  }
  const legacyBeforeDay = cutoffDay(nowMs, OPTION_CHAIN_RETENTION_DAYS)
  for (const result of pruneLegacyOptionsLevels(rootDir, legacyBeforeDay)) {
    console.log(
      `[legacy/options-levels/${result.symbol}] 清理 ${result.removed.length} 个（早于 ${legacyBeforeDay}）`,
    )
  }
}

/**
 * 执行买卖量采集子命令。
 *
 * @param parsed 已解析参数
 */
async function runCollectVolume(parsed: ParsedArguments): Promise<void> {
  const rootDir = readRootDir(parsed)
  const symbols = readListFlag(parsed, 'symbols', DEFAULT_VOLUME_SYMBOLS)
  const intervalNames = readListFlag(parsed, 'intervals', DEFAULT_VOLUME_INTERVALS)
  const intervals = intervalNames.map((name) => parseVolumeInterval(name))
  const limit = readNumberFlag(parsed, 'limit', DEFAULT_KLINE_LIMIT)
  const retentionDays = readNumberFlag(
    parsed,
    'retention-days',
    VOLUME_SHORT_INTERVAL_RETENTION_DAYS,
  )
  const repeatSeconds =
    readOptionalStringFlag(parsed, 'repeat-seconds') === null
      ? NO_REPEAT
      : readNumberFlag(parsed, 'repeat-seconds', 0)
  const proxy = readProxyFlag(parsed, null)

  const store = createDayShardStore(rootDir)
  const client = createBinanceClient({ httpClient: createNodeHttpsClient(), proxy })

  console.log(`数据目录 ${rootDir}`)
  console.log(`代理 ${proxy === null ? '直连' : `${proxy.host}:${proxy.port}`}`)

  const run = async (): Promise<void> => {
    const startedAt = Date.now()
    const results = await collectVolumeSeries({
      client,
      store,
      symbols,
      intervals,
      limit,
      now: () => Date.now(),
    })
    for (const result of results) {
      const appended = result.appends.reduce((sum, append) => sum + append.appended, 0)
      const skipped = result.appends.reduce((sum, append) => sum + append.skipped, 0)
      console.log(
        `[${result.symbol}/${result.interval}] ${formatNumber(result.barCount, 0)} 根 | 新增 ${appended} | 跳过 ${skipped} | ${result.elapsedMs}ms | 读回校验 ${result.readBackVerified ? 'OK' : '无数据'}`,
      )
    }
    pruneVolume(store, symbols, intervals, startedAt, retentionDays)
    console.log(`本次耗时 ${Date.now() - startedAt}ms`)
  }

  await runOnceOrRepeat(run, repeatSeconds)
}

/**
 * 清理短周期买卖量的过期分片。
 *
 * @param store 存储
 * @param symbols 交易对
 * @param intervals 周期
 * @param nowMs 当前毫秒
 * @param retentionDays 保留天数
 */
function pruneVolume(
  store: DayShardStore,
  symbols: readonly string[],
  intervals: readonly VolumeInterval[],
  nowMs: number,
  retentionDays: number,
): void {
  const beforeDay = cutoffDay(nowMs, retentionDays)
  for (const symbol of symbols) {
    for (const interval of intervals) {
      if (VOLUME_PERMANENT_INTERVALS.includes(interval)) {
        continue
      }
      const removed = store.purgeBefore({ stream: `volume/${symbol}/${interval}`, beforeDay })
      if (removed.length > 0) {
        console.log(
          `[${symbol}/${interval}] 清理过期分片 ${removed.length} 个（早于 ${beforeDay}）`,
        )
      }
    }
  }
}

/**
 * 执行钟级大单分层采集子命令。
 *
 * @param parsed 已解析参数
 */
async function runCollectTrades(parsed: ParsedArguments): Promise<void> {
  const rootDir = readRootDir(parsed)
  const symbols = readListFlag(parsed, 'symbols', DEFAULT_ORDERFLOW_SYMBOLS)
  // OKX 不提供逐笔成交流，默认排除，避免每轮都报一次「不支持」
  const venueNames = readListFlag(
    parsed,
    'venues',
    DEFAULT_ORDERFLOW_VENUES.filter((venue) => venue !== 'okx'),
  )
  const venues = venueNames.map((name) => parseOrderflowVenue(name))
  const repeatSeconds =
    readOptionalStringFlag(parsed, 'repeat-seconds') === null
      ? NO_REPEAT
      : readNumberFlag(parsed, 'repeat-seconds', 0)
  const proxy = readProxyFlag(parsed, null)

  const store = createDayShardStore(rootDir)
  const stateDir = join(rootDir, 'orderflow', 'state')
  const client = createFlowClient({ httpClient: createNodeHttpsClient(), proxy })

  console.log(`数据目录 ${rootDir}`)
  console.log(`代理 ${proxy === null ? '直连' : `${proxy.host}:${proxy.port}`}`)
  console.log(`交易所 ${venues.join(', ')} | 交易对 ${symbols.join(', ')}`)

  const run = async (): Promise<void> => {
    const startedAt = Date.now()
    const rounds = await collectTradeBuckets({
      client,
      store,
      stateDir,
      venues,
      symbols,
      now: () => Date.now(),
    })
    for (const round of rounds) {
      const sealed =
        round.sealedHour === null
          ? ''
          : ` | 封存 ${new Date(round.sealedHour).toISOString().slice(11, 16)}Z`
      console.log(
        `[${round.symbol}][${round.venue}] ${round.coverage} | 新增 ${round.added} 笔${sealed}`,
      )
    }
    console.log(`本次耗时 ${Date.now() - startedAt}ms`)
  }

  await runOnceOrRepeat(run, repeatSeconds)
}

/**
 * 执行只读服务子命令。
 *
 * @param parsed 已解析参数
 */
async function runServe(parsed: ParsedArguments): Promise<void> {
  const rootDir = readRootDir(parsed)
  const port = readNumberFlag(parsed, 'port', DEFAULT_ORDERFLOW_PORT)
  const store = createDayShardStore(rootDir)
  const handle = await startOrderflowServer({ store, port })
  console.log(`数据目录 ${rootDir}`)
  console.log(`订单流只读服务 http://127.0.0.1:${handle.port}`)
  console.log('  GET /health')
  console.log('  GET /orderflow/days?stream=orderflow/depth/binance/BTCUSDT')
  console.log('  GET /orderflow/records?stream=...&day=YYYY-MM-DD')
  console.log('  GET /options/series?currency=BTC&step=minute|hour|day&days=30&limit=500')
  console.log('  GET /options/stats?currency=BTC&windows=30,90,365')
  console.log('按 Ctrl+C 结束')

  await new Promise<void>((resolve) => {
    const stop = (): void => {
      void handle.close().then(() => resolve())
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  })
}

/**
 * 校验并转换交易所标识。
 *
 * @param name 命令行传入的交易所名
 * @returns 交易所标识
 * @throws AnalyticsError 不在支持列表里
 */
function parseOrderflowVenue(name: string): OrderflowVenue {
  for (const candidate of ORDERFLOW_VENUES) {
    if (candidate === name) return candidate
  }
  throw new AnalyticsError(ANALYTICS_ERROR_CODES.ARGUMENT_INVALID, `不支持的交易所：${name}`, {
    name,
    supported: ORDERFLOW_VENUES,
  })
}

/**
 * 执行订单流采集子命令。
 *
 * 每一轮都重新拉五家的深度、成交、持仓，各自落盘。任何一家失败只影响它自己，
 * 不阻断其它家——面板的价值在于尽可能多地拿到事实。
 *
 * @param parsed 已解析参数
 */
async function runCollectOrderflow(parsed: ParsedArguments): Promise<void> {
  const rootDir = readRootDir(parsed)
  const symbols = readListFlag(parsed, 'symbols', DEFAULT_ORDERFLOW_SYMBOLS)
  const venueNames = readListFlag(parsed, 'venues', DEFAULT_ORDERFLOW_VENUES)
  const venues = venueNames.map((name) => parseOrderflowVenue(name))
  const repeatSeconds =
    readOptionalStringFlag(parsed, 'repeat-seconds') === null
      ? NO_REPEAT
      : readNumberFlag(parsed, 'repeat-seconds', 0)
  const proxy = readProxyFlag(parsed, null)

  const store = createDayShardStore(rootDir)
  const panelClient = createPanelClient({ httpClient: createNodeHttpsClient(), proxy })

  console.log(`数据目录 ${rootDir}`)
  console.log(`代理 ${proxy === null ? '直连' : `${proxy.host}:${proxy.port}`}`)
  console.log(`交易所 ${venues.join(', ')} | 交易对 ${symbols.join(', ')}`)

  const run = async (): Promise<void> => {
    const startedAt = Date.now()
    for (const symbol of symbols) {
      const panel = await panelClient.fetch(symbol, venues)
      const collected = persistOrderflowPanel(store, panel)
      for (const summary of collected.venues) {
        const parts = [
          `深度 ${summary.depthRows}`,
          `成交 ${summary.flowRows}`,
          `持仓 ${summary.positioningRows}`,
        ]
        const errorText = summary.errors.length === 0 ? '' : ` | 失败 ${summary.errors.join('；')}`
        console.log(`[${symbol}][${summary.venue}] ${parts.join(' | ')}${errorText}`)
      }
      const appended = collected.appends.reduce((sum, item) => sum + item.appended, 0)
      const skipped = collected.appends.reduce((sum, item) => sum + item.skipped, 0)
      console.log(
        `[${symbol}] 新增 ${appended} 条 / 去重跳过 ${skipped} 条 | 矛盾 ${collected.contradictions} 项`,
      )
    }
    console.log(`本次耗时 ${Date.now() - startedAt}ms`)
  }

  await runOnceOrRepeat(run, repeatSeconds)
}

/**
 * 执行 cloudtrade 迁移子命令。
 *
 * @param parsed 已解析参数
 */
async function runMigrateCloudtrade(parsed: ParsedArguments): Promise<void> {
  const rootDir = readRootDir(parsed)
  const cloudtradeHome = readStringFlag(parsed, 'cloudtrade-home', join(homedir(), '.cloudtrade'))

  console.log(`数据目录 ${rootDir}`)
  console.log(`cloudtrade 目录 ${cloudtradeHome}`)

  const result = migrateCloudtradeData({
    rootDir,
    cloudtradeHome,
    now: () => Date.now(),
  })
  const manifest = result.manifest

  for (const stats of manifest.options.cadence) {
    console.log(
      `[${stats.symbol}] 原始 ${formatNumber(stats.rawRecords, 0)} 条 → 去重后 ${formatNumber(stats.uniqueSnapshots, 0)} 条 | ${stats.firstDay} → ${stats.lastDay} | 间隔中位 ${stats.gapMedianMinutes} 分钟 / p90 ${stats.gapP90Minutes} 分钟 / 最大 ${stats.gapMaxMinutes} 分钟 | 单日条数中位 ${stats.snapshotsPerDayMedian}`,
    )
  }
  for (const series of manifest.volume.series) {
    const detail = series.intervals
      .map((item) => `${item.interval}:${formatNumber(item.bars, 0)}`)
      .join(' ')
    console.log(`[${series.symbol}] 买卖量 ${detail}（volume_rev ${series.volumeRev}）`)
  }
  console.log(
    `期权写入 ${formatNumber(manifest.options.recordsImported, 0)} 条（去重丢弃 ${formatNumber(manifest.options.duplicatesDropped, 0)} 条，忽略其他品种 ${formatNumber(manifest.options.skippedNonTargetRecords, 0)} 条）`,
  )
  console.log(
    `买卖量写入 ${formatNumber(manifest.volume.barsImported, 0)} 根 | 清单 ${result.manifestPath}`,
  )
  console.log(`注意：${manifest.caveats[0]}`)
}

/**
 * 打印帮助。
 */
function printHelp(): void {
  console.log(`KCQ 分析数据采集器

用法：
  tsx packages/analytics/src/cli.ts <子命令> [参数]

子命令：
  collect-options      拉 Deribit 期权链并计算聚合位
      --root <dir>                 数据目录（默认桌面端 userData/analytics）
      --currencies BTC,ETH         标的列表（默认 BTC,ETH）
      --proxy <host:port>          Deribit 代理（默认 127.0.0.1:7078，必填）
      --with-chain                 同时落原始期权链
      --repeat-seconds <n>         每 n 秒重复一次，Ctrl+C 退出

  backfill-options     从分钟分片补齐小时行与日行（可重复执行）
      --root <dir>                 数据目录
      --currencies BTC,ETH         标的列表（默认 BTC,ETH）
      --from <YYYY-MM-DD>          只处理该日及之后；省略时挑缺日行的历史 + 最近两天

  collect-volume       拉 Binance K 线买卖量
      --root <dir>                 数据目录
      --symbols BTCUSDT,ETHUSDT    交易对列表
      --intervals 1m,5m,15m,1h,4h,1d  周期列表
      --limit <n>                  每个周期拉取根数（默认 500，上限 1000）
      --proxy <host:port|none>     代理（默认直连）
      --retention-days <n>         短周期滚动保留天数（默认 90）
      --repeat-seconds <n>         每 n 秒重复一次

  collect-orderflow    拉五家交易所的深度、成交、持仓并落盘
      --root <dir>                 数据目录
      --symbols BTCUSDT,ETHUSDT    交易对列表
      --venues <list>              交易所列表（默认 binance,okx,bybit,bitget,hyperliquid）
      --proxy <host:port|none>     代理（默认直连）
      --repeat-seconds <n>         每 n 秒重复一次；不给则只跑一轮

  serve                起只读 HTTP 服务，供面板与 Agent 读分片
      --root <dir>                 数据目录
      --port <n>                   监听端口（默认 8093）

  collect-trades       续拉逐笔成交，按小时累加并封存大单分层
      --root <dir>                 数据目录
      --symbols BTCUSDT,ETHUSDT    交易对列表
      --venues <list>              交易所列表（默认排除 okx，它不提供逐笔）
      --proxy <host:port|none>     代理（默认直连）
      --repeat-seconds <n>         每 n 秒重复一次；建议 10

  migrate-cloudtrade   导入 cloudtrade 历史到 legacy/ 子树
      --root <dir>                 数据目录
      --cloudtrade-home <dir>      cloudtrade 数据目录（默认 ~/.cloudtrade）
`)
}

/**
 * 打印异常。
 *
 * @param error 捕获到的值
 */
function printError(error: unknown): void {
  const normalized = toError(error)
  if (normalized instanceof AnalyticsError) {
    console.error(`[错误] ${normalized.code} ${normalized.message}`)
    if (Object.keys(normalized.details).length > 0) {
      console.error(`       细节 ${JSON.stringify(normalized.details)}`)
    }
    return
  }
  console.error(`[错误] ${normalized.message}`)
}

/**
 * 命令行入口。
 */
async function main(): Promise<void> {
  const parsed = parseArguments(process.argv.slice(2))

  switch (parsed.command) {
    case 'collect-options':
      await runCollectOptions(parsed)
      return
    case 'backfill-options':
      await runBackfillOptions(parsed)
      return
    case 'collect-volume':
      await runCollectVolume(parsed)
      return
    case 'collect-orderflow':
      await runCollectOrderflow(parsed)
      return
    case 'serve':
      await runServe(parsed)
      return
    case 'collect-trades':
      await runCollectTrades(parsed)
      return
    case 'migrate-cloudtrade':
      await runMigrateCloudtrade(parsed)
      return
    case 'help':
    case '--help':
      printHelp()
      return
    default:
      throw new AnalyticsError(
        ANALYTICS_ERROR_CODES.CLI_COMMAND_UNKNOWN,
        `未知子命令：${parsed.command}`,
        { command: parsed.command },
      )
  }
}

main().catch((error: unknown) => {
  printError(error)
  process.exitCode = 1
})
