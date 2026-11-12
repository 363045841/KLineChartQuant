/**
 * 回测引擎命令行入口。
 *
 * 用法：
 *   tsx packages/backtest/src/cli.ts run [--symbols BTCUSDT,ETHUSDT] [--out temp/backtest-run]
 *       [--cache temp/ichimoku-filter-eval/cache] [--options <analytics 根目录>]
 *       [--max-bars 200] [--target-r 2] [--cost-bps 10] [--min-stop-ratio 0]
 *       [--stop-source cloud|structure] [--pivot-lookback 3]
 *       [--require-bias] [--htf off|4h|1d] [--htf-lookback 3] [--signals l2|smc-break]
 *       [--seed 42] [--random-samples 1000] [--fetch]
 *
 * 每次运行都会：
 * 1. 载入 1h K 线与期权快照；
 * 2. 回放 L2 信号并按理论规则结算；
 * 3. 与 temp/ichimoku-filter-eval/report-v2.md 对齐信号数（交叉验证）；
 * 4. 写出 report.json / report.md / trades.csv。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { BreakDirection } from '@363045841yyt/klinechart-core/structure'
import { buildBiasSeries, buildHtfBiasSeries, intersectBias } from './impl/bias'
import { DEFAULT_COST_BPS_PER_SIDE, DEFAULT_COST_SENSITIVITY_BPS } from './impl/cost'
import { computeIchimoku } from './impl/ichimoku'
import {
  fetchCandles,
  loadCandlesFromCache,
  loadOptionSnapshots,
  type OptionSnapshot,
} from './impl/loader'
import { replaySymbol } from './impl/replayer'
import { writeReports } from './impl/report'
import {
  computeBuyHold,
  computeCostSensitivity,
  computeRandomBenchmark,
  computeStats,
  groupByGrade,
} from './impl/stats'
import { createStopResolver } from './impl/stop'
import type {
  BacktestConfig,
  BacktestReport,
  Candle,
  CrossValidation,
  HtfTimeframe,
  IchimokuSeries,
  SignalSource,
  StopSource,
  SymbolBacktestResult,
} from './types'

/** 默认输出目录。 */
const DEFAULT_OUT_DIR = 'temp/backtest-run'

/** 默认 K 线缓存目录（复用 task-3 的缓存）。 */
const DEFAULT_CACHE_DIR = 'temp/ichimoku-filter-eval/cache'

/** 信号数交叉验证的参考文件。 */
const DEFAULT_REFERENCE = 'temp/ichimoku-filter-eval/signals.csv'

/** 默认交易对。 */
const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT']

/** 默认第一目标倍数（R）。 */
const DEFAULT_TARGET_R = 2

/** 第二目标相对第一目标的额外距离（R）；它只记录是否到达，不参与结算。 */
const TARGET2_OFFSET_R = 1

/** 运行参数。 */
interface RunOptions {
  readonly symbols: readonly string[]
  readonly outDir: string
  readonly cacheDir: string
  readonly optionRoot: string
  readonly maxBars: number
  readonly targetR: number
  readonly costBps: number
  readonly minStopRatio: number
  readonly stopSource: StopSource
  readonly pivotLookback: number
  readonly requireBias: boolean
  readonly htf: HtfTimeframe | null
  readonly htfLookback: number
  readonly signalSource: SignalSource
  readonly smcMinMargin: number
  readonly timeframe: '1h' | '4h'
  readonly seed: number
  readonly randomSamples: number
  readonly fetch: boolean
  readonly reference: string
}

/** 已解析参数。 */
interface ParsedArguments {
  readonly command: string
  readonly flags: ReadonlyMap<string, string | true>
}

/**
 * 解析命令行参数。
 *
 * @param argv 进程参数
 * @returns 子命令与参数表
 */
function parseArguments(argv: readonly string[]): ParsedArguments {
  const command = argv[0] ?? 'help'
  const flags = new Map<string, string | true>()
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      throw new Error(`无法识别的参数：${token}`)
    }
    const name = token.slice(2)
    const next = argv[index + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(name, next)
      index += 1
    } else {
      flags.set(name, true)
    }
  }
  return { command, flags }
}

/**
 * 读取字符串参数。
 *
 * @param parsed 参数
 * @param name 名称
 * @param fallback 缺省值
 * @returns 值
 */
function readString(parsed: ParsedArguments, name: string, fallback: string): string {
  const value = parsed.flags.get(name)
  if (value === undefined) return fallback
  if (value === true) throw new Error(`参数 --${name} 需要一个值`)
  return value
}

/**
 * 读取数字参数。
 *
 * @param parsed 参数
 * @param name 名称
 * @param fallback 缺省值
 * @returns 数值
 */
function readNumber(parsed: ParsedArguments, name: string, fallback: number): number {
  const raw = parsed.flags.get(name)
  if (raw === undefined) return fallback
  if (raw === true) throw new Error(`参数 --${name} 需要一个值`)
  const value = Number(raw)
  if (!Number.isFinite(value)) throw new Error(`参数 --${name} 不是数字：${raw}`)
  return value
}

/**
 * 读取开关参数。
 *
 * @param parsed 参数
 * @param name 名称
 * @returns 是否出现
 */
function readFlag(parsed: ParsedArguments, name: string): boolean {
  return parsed.flags.get(name) === true
}

/**
 * 读取列表参数。
 *
 * @param parsed 参数
 * @param name 名称
 * @param fallback 缺省值
 * @returns 字符串列表
 */
function readList(
  parsed: ParsedArguments,
  name: string,
  fallback: readonly string[],
): readonly string[] {
  const raw = parsed.flags.get(name)
  if (raw === undefined) return fallback
  if (raw === true) throw new Error(`参数 --${name} 需要一个值`)
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

/**
 * 解析运行参数。
 *
 * @param parsed 参数
 * @returns 运行参数
 */
function resolveOptions(parsed: ParsedArguments): RunOptions {
  const appData = process.env.APPDATA
  if (appData === undefined || appData === '') {
    throw new Error('缺少 APPDATA 环境变量，无法定位正式数据目录')
  }
  const stopSource = readString(parsed, 'stop-source', 'cloud')
  if (stopSource !== 'cloud' && stopSource !== 'structure') {
    throw new Error(`参数 --stop-source 只能是 cloud 或 structure：${stopSource}`)
  }
  const htfRaw = readString(parsed, 'htf', 'off')
  if (htfRaw !== 'off' && htfRaw !== '4h' && htfRaw !== '1d') {
    throw new Error(`参数 --htf 只能是 off / 4h / 1d：${htfRaw}`)
  }
  const signalsRaw = readString(parsed, 'signals', 'l2')
  if (signalsRaw !== 'l2' && signalsRaw !== 'smc-break') {
    throw new Error(`参数 --signals 只能是 l2 或 smc-break：${signalsRaw}`)
  }
  const timeframeRaw = readString(parsed, 'timeframe', '1h')
  if (timeframeRaw !== '1h' && timeframeRaw !== '4h') {
    throw new Error(`参数 --timeframe 只能是 1h 或 4h：${timeframeRaw}`)
  }
  const targetR = readNumber(parsed, 'target-r', DEFAULT_TARGET_R)
  if (!(targetR > 0)) {
    throw new Error(`参数 --target-r 必须是正数：${targetR}`)
  }
  return {
    symbols: readList(parsed, 'symbols', DEFAULT_SYMBOLS),
    outDir: resolve(readString(parsed, 'out', DEFAULT_OUT_DIR)),
    cacheDir: resolve(readString(parsed, 'cache', DEFAULT_CACHE_DIR)),
    optionRoot: resolve(
      readString(parsed, 'options', join(appData, 'KLineChart Quant', 'analytics')),
    ),
    maxBars: readNumber(parsed, 'max-bars', 200),
    targetR: readNumber(parsed, 'target-r', DEFAULT_TARGET_R),
    costBps: readNumber(parsed, 'cost-bps', DEFAULT_COST_BPS_PER_SIDE),
    minStopRatio: readNumber(parsed, 'min-stop-ratio', 0),
    stopSource,
    pivotLookback: readNumber(parsed, 'pivot-lookback', 3),
    requireBias: readFlag(parsed, 'require-bias'),
    htf: htfRaw === 'off' ? null : htfRaw,
    htfLookback: readNumber(parsed, 'htf-lookback', 3),
    signalSource: signalsRaw,
    smcMinMargin: readNumber(parsed, 'smc-min-margin', 0),
    timeframe: timeframeRaw,
    seed: readNumber(parsed, 'seed', 42),
    randomSamples: readNumber(parsed, 'random-samples', 1000),
    fetch: readFlag(parsed, 'fetch'),
    reference: resolve(readString(parsed, 'reference', DEFAULT_REFERENCE)),
  }
}

/**
 * 计算"首个可评估 bar"索引（与评估脚本的 firstEvaluable 口径一致）。
 *
 * @param candles K 线
 * @param series 指标（由回放前的计算得到）
 * @returns 索引；不存在返回 -1
 */
function findFirstEvaluable(candles: readonly Candle[], series: IchimokuSeries): number {
  for (let index = 0; index < candles.length; index += 1) {
    const cloudReady = series.spanA[index] !== null && series.spanB[index] !== null
    const tkReady =
      index >= 1 &&
      series.tenkan[index] !== null &&
      series.kijun[index] !== null &&
      series.tenkan[index - 1] !== null &&
      series.kijun[index - 1] !== null
    const regimeReady = index >= 27 && series.regimeDiff[index] !== null
    if (cloudReady && tkReady && regimeReady) {
      return index
    }
  }
  return -1
}

/**
 * 读取参考 CSV 里的 L2 全历史行。
 *
 * @param path signals.csv 路径
 * @returns symbol → 信号数 / 每周频率
 */
function readReferenceSignals(
  path: string,
  timeframe: '1h' | '4h',
): Map<string, { signals: number; perWeek: number }> {
  const result = new Map<string, { signals: number; perWeek: number }>()
  if (!existsSync(path)) {
    return result
  }
  const lines = readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
  // 跳过表头
  for (const line of lines.slice(1)) {
    const fields = line.split(',')
    if (fields.length < 9) continue
    const [symbol, interval, level, , window] = fields
    if (level !== 'L2' || window !== 'full' || interval !== timeframe) continue
    const signals = Number(fields[5])
    const perWeek = Number(fields[8])
    if (Number.isFinite(signals) && Number.isFinite(perWeek)) {
      result.set(symbol, { signals, perWeek })
    }
  }
  return result
}

/**
 * 构造交叉验证结果。
 *
 * @param reference 参考 CSV 路径
 * @param referenceData 参考数据
 * @param engine 引擎结果（品种 → 信号数、覆盖天数）
 * @returns 交叉验证
 */
function buildCrossValidation(
  reference: string,
  referenceData: Map<string, { signals: number; perWeek: number }>,
  engine: Map<string, { signals: number; perWeek: number }>,
  timeframe: '1h' | '4h',
): CrossValidation {
  const rows = [...engine.entries()].map(([symbol, engineStats]) => {
    const ref = referenceData.get(symbol)
    const referenceSignals = ref?.signals ?? null
    const referencePerWeek = ref?.perWeek ?? null
    const matched =
      referenceSignals === null || referencePerWeek === null
        ? // 参考文件里没有该品种时无从比对，不算不一致，也不计入总体判定
          true
        : referenceSignals === engineStats.signals &&
          Math.abs(referencePerWeek - engineStats.perWeek) <= 0.005
    return {
      symbol,
      timeframe,
      engineSignals: engineStats.signals,
      referenceSignals,
      enginePerWeek: engineStats.perWeek,
      referencePerWeek,
      matched,
    }
  })
  return {
    reference,
    rows,
    matched:
      rows.some((row) => row.referenceSignals !== null) &&
      rows.filter((row) => row.referenceSignals !== null).every((row) => row.matched),
  }
}

/**
 * 运行回测。
 *
 * @param options 运行参数
 */
async function runBacktest(options: RunOptions): Promise<void> {
  const config: BacktestConfig = {
    symbols: options.symbols,
    timeframe: options.timeframe,
    target1R: options.targetR,
    target2R: options.targetR + TARGET2_OFFSET_R,
    maxBars: options.maxBars,
    cloudToleranceRatio: 0.5,
    minStopDistanceRatio: options.minStopRatio,
    stopSource: options.stopSource,
    pivotLookback: options.pivotLookback,
    requireBiasAgreement: options.requireBias,
    htfTimeframe: options.htf,
    htfLookback: options.htfLookback,
    signalSource: options.signalSource,
    smcMinMarginRatio: options.smcMinMargin,
    costBpsPerSide: options.costBps,
    randomSeed: options.seed,
    randomSamples: options.randomSamples,
    klinesCacheDir: options.cacheDir,
    optionRoot: options.optionRoot,
    outDir: options.outDir,
  }

  const results: SymbolBacktestResult[] = []
  const engineStats = new Map<string, { signals: number; perWeek: number }>()
  const dataKlines: Record<string, { bars: number; first: string; last: string }> = {}
  const dataOptions: Record<string, { records: number; first: string; last: string }> = {}

  for (const symbol of options.symbols) {
    const candles: Candle[] = options.fetch
      ? await fetchCandles(options.cacheDir, symbol, options.timeframe)
      : loadCandlesFromCache(options.cacheDir, symbol, options.timeframe)
    const currency = symbol === 'BTCUSDT' ? 'BTC' : symbol === 'ETHUSDT' ? 'ETH' : null
    const snapshots: OptionSnapshot[] =
      currency === null ? [] : loadOptionSnapshots(options.optionRoot, currency)

    const stopResolver = createStopResolver(candles, config.stopSource, config.pivotLookback)
    let biasSeries: (BreakDirection | null)[] | null = null
    if (config.requireBiasAgreement) {
      const ltfBias = buildBiasSeries(candles, config.pivotLookback)
      biasSeries =
        config.htfTimeframe === null
          ? ltfBias
          : intersectBias([
              ltfBias,
              buildHtfBiasSeries(candles, config.htfTimeframe, config.htfLookback),
            ])
    }
    const replay = replaySymbol({ symbol, candles, snapshots, stopResolver, biasSeries, config })
    const stats = computeStats(replay.trades)
    const byGrade = groupByGrade(replay.trades)
    const buyHold = computeBuyHold(symbol, candles)

    const longRatio =
      replay.signals.length === 0
        ? 0.5
        : replay.signals.filter((signal) => signal.direction === 'long').length /
          replay.signals.length
    const series = computeIchimoku(candles)
    const randomEntry = computeRandomBenchmark({
      symbol,
      candles,
      series,
      signalDirections: replay.signalDirections,
      longRatio,
      stopResolver,
      biasSeries,
      config,
    })

    const firstEvaluable = findFirstEvaluable(candles, series)
    const coverageDays =
      firstEvaluable < 0
        ? 0
        : (candles[candles.length - 1].closeTime - candles[firstEvaluable].closeTime) / 86_400_000
    // 交叉验证必须与 report-v2 的 L2 口径对齐：用过滤前的原始信号数。
    const rawSignalCount = replay.signals.length + replay.filteredSignalCount
    engineStats.set(symbol, {
      signals: rawSignalCount,
      perWeek: coverageDays > 0 ? (rawSignalCount / coverageDays) * 7 : 0,
    })

    dataKlines[symbol] = {
      bars: candles.length,
      first: new Date(candles[0].openTime).toISOString().slice(0, 10),
      last: new Date(candles[candles.length - 1].closeTime).toISOString().slice(0, 10),
    }
    dataOptions[symbol] = {
      records: snapshots.length,
      first: snapshots.length > 0 ? new Date(snapshots[0].ts).toISOString().slice(0, 10) : '—',
      last:
        snapshots.length > 0
          ? new Date(snapshots[snapshots.length - 1].ts).toISOString().slice(0, 10)
          : '—',
    }

    results.push({
      symbol,
      barCount: candles.length,
      firstBarTime: candles[0].openTime,
      lastBarTime: candles[candles.length - 1].closeTime,
      signalCount: rawSignalCount,
      missedStopSignalCount: replay.missedStopSignalCount,
      filteredSignalCount: replay.filteredSignalCount,
      biasFilteredSignalCount: replay.biasFilteredSignalCount,
      // 展示频率用可开仓信号（过滤后），交叉验证用 engineStats 的原始口径。
      signalsPerWeek: coverageDays > 0 ? (replay.signals.length / coverageDays) * 7 : 0,
      trades: replay.trades,
      stats,
      byGrade,
      buyHold,
      randomEntry,
      costSensitivity: computeCostSensitivity(replay.trades, DEFAULT_COST_SENSITIVITY_BPS),
    })
  }

  const allTrades = results.flatMap((result) => result.trades)
  const combined = {
    stats: computeStats(allTrades),
    byGrade: groupByGrade(allTrades),
  }
  const costSensitivity = computeCostSensitivity(allTrades, DEFAULT_COST_SENSITIVITY_BPS)

  // 交叉验证的参考口径是「一目 L2 信号数」，换信号源后不可比，直接跳过。
  const crossValidationApplies = config.signalSource === 'l2'
  const referenceData = crossValidationApplies
    ? readReferenceSignals(options.reference, config.timeframe)
    : new Map<string, { signals: number; perWeek: number }>()
  const crossValidation = buildCrossValidation(
    options.reference,
    referenceData,
    engineStats,
    config.timeframe,
  )

  const report: BacktestReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    config,
    data: { klines: dataKlines, optionSnapshots: dataOptions },
    crossValidation,
    results,
    combined,
    costSensitivity,
    caveats: [
      `KCQ 的 SMC 结构尚未实现：信号用一目均衡表替身（regime + 云侧 + TK 交叉），三价规则（收盘入场、云边止损、${config.target1R}R/${config.target2R}R 目标）是刻意简化，第二版会换成结构位。`,
      `成本按单边 ${config.costBpsPerSide} bp 计（手续费与滑点合并，入场与出场各收一次）；只改 R 记账，不建模「滑点把价格推过止损」的次级效应。`,
      '永续资金费率未建模：当前 K 线取自 Binance 现货，接永续数据后需补 funding 项。',
      '每个信号独立结算、允许重叠持仓：统计的是信号自身期望，不是某条资金曲线；总 R 不能直接当作账户收益。',
      '止损与目标按 high/low 触及判定；同一根 bar 同时触及时按止损处理（保守）。',
      'invalidated 定义为「持仓期间出现反向 L2 信号」，按该 bar 收盘价出场；expired 为超过 maxBars 未触发止损/目标，按该 bar 收盘价出场——两条规则是 #7 骨架的简化实现，待 #7 定稿后对齐。',
      'managedOutcome 恒为 null：1R 保本 / 第一目标减半 / 结构追踪等管理规则第一版未实现。',
      '期权位只有约 39 天历史：A/B 分级只覆盖窗口内交易，窗口外交易记为无分级；A/B 两组的样本量差异很大，结论只能当方向性参考。',
      '买入持有是价格收益率，策略是每笔 R，两者单位不同，不能直接相减；要比较需要先定仓位与风险预算（第一版不做）。',
    ],
  }

  const paths = writeReports(report, options.outDir)

  // 控制台摘要
  console.log(`回测完成：${options.symbols.join(', ')} @ ${config.timeframe}`)
  for (const result of results) {
    const stats = result.stats
    console.log(
      `[${result.symbol}] L2 ${result.signalCount} 个信号（${result.signalsPerWeek.toFixed(2)}/周）| 偏向剔除 ${result.biasFilteredSignalCount} | 无止损位 ${result.missedStopSignalCount} | 止损过近 ${result.filteredSignalCount} | 笔数 ${stats.trades} | 期望 ${stats.expectancyR.toFixed(3)}R | 总R ${stats.totalR.toFixed(1)} | PF ${stats.profitFactor === null ? '—' : stats.profitFactor.toFixed(2)} | 胜率 ${(stats.winRate === null ? 0 : stats.winRate * 100).toFixed(1)}% | 回撤 ${stats.maxDrawdownR.toFixed(1)}R`,
    )
    const a = result.byGrade.A
    const b = result.byGrade.B
    console.log(
      `         A 级 ${a.trades} 笔 期望 ${a.expectancyR.toFixed(3)}R | B 级 ${b.trades} 笔 期望 ${b.expectancyR.toFixed(3)}R | 随机基准期望 ${result.randomEntry.stats.expectancyR.toFixed(3)}R`,
    )
  }
  const comparableRows = crossValidation.rows.filter((row) => row.referenceSignals !== null)
  console.log(
    comparableRows.length === 0
      ? `交叉验证：跳过（${
          crossValidationApplies
            ? `参考文件不含 ${config.timeframe} 数据`
            : '非 L2 信号源，与参考口径不可比'
        }）`
      : `交叉验证：${crossValidation.matched ? '✅ 全部一致' : '❌ 存在偏差'}（参考 ${crossValidation.reference}）`,
  )
  for (const row of crossValidation.rows) {
    console.log(
      `  ${row.symbol}: 引擎 ${row.engineSignals} 信号 / ${row.enginePerWeek.toFixed(3)} 次每周；参考 ${row.referenceSignals ?? '—'} / ${row.referencePerWeek ?? '—'}`,
    )
  }
  console.log(
    `成本：单边 ${config.costBpsPerSide} bp | 合计毛期望 ${combined.stats.expectancyGrossR.toFixed(3)}R | 合计净期望 ${combined.stats.expectancyR.toFixed(3)}R | 盈亏平衡 ${
      costSensitivity.breakevenBpsPerSide === null
        ? '无正期望'
        : `${costSensitivity.breakevenBpsPerSide.toFixed(1)} bp/边`
    }`,
  )
  console.log(`输出：${paths.jsonPath}、${paths.mdPath}、${paths.csvPath}`)
}

/**
 * 打印帮助。
 */
function printHelp(): void {
  console.log(`KCQ 回测引擎（第一版）

用法：
  tsx packages/backtest/src/cli.ts run [参数]

参数：
  --symbols BTCUSDT,ETHUSDT   交易对（默认 BTCUSDT,ETHUSDT）
  --timeframe <1h|4h>         K 线周期（默认 1h）
  --out <dir>                 输出目录（默认 temp/backtest-run）
  --cache <dir>               K 线缓存目录（默认 temp/ichimoku-filter-eval/cache）
  --options <dir>             期权数据根目录（默认 %APPDATA%/KLineChart Quant/analytics）
  --max-bars <n>              最长持仓 bar 数（默认 200）
  --target-r <n>              第一目标倍数 R（默认 2；第二目标固定 +1R，只记录不结算）
  --cost-bps <n>              结算用的单边成本，bps（默认 10，现货 taker 口径）
  --min-stop-ratio <n>        最小止损距离占入场价的比例，0 = 不过滤（默认 0）
  --stop-source <name>        止损来源：cloud（云边）或 structure（结构枢轴），默认 cloud
  --pivot-lookback <n>        结构止损的枢轴窗口，两侧各需 bar 数（默认 3）
  --require-bias              要求信号方向与结构偏向一致才开仓（默认关闭）
  --htf <off|4h|1d>           参与偏向确认的高周期；off 表示只看 LTF（默认 off）
  --htf-lookback <n>          高周期上的枢轴窗口（默认 3）
  --signals <l2|smc-break>    入场信号源：一目 L2 或结构破坏事件（默认 l2）
  --smc-min-margin <n>        结构破位入场的最小力度 marginRatio，0 = 不过滤（默认 0）
  --seed <n>                  随机基准种子（默认 42）
  --random-samples <n>        随机基准采样数（默认 1000）
  --fetch                     缓存缺失时从 Binance 拉取（默认只读缓存）
  --reference <path>          信号数交叉验证参考 CSV（默认 temp/ichimoku-filter-eval/signals.csv）
`)
}

/**
 * 入口。
 */
async function main(): Promise<void> {
  const parsed = parseArguments(process.argv.slice(2))
  if (parsed.command === 'help' || parsed.command === '--help') {
    printHelp()
    return
  }
  if (parsed.command !== 'run') {
    throw new Error(`未知子命令：${parsed.command}`)
  }
  await runBacktest(resolveOptions(parsed))
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[错误] ${message}`)
  process.exitCode = 1
})
