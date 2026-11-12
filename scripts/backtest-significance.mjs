#!/usr/bin/env node
/**
 * 回测显著性口径计算（2022+ / 5bp / Neff 校正）。
 *
 * 解决的问题：`packages/backtest` 只输出逐笔交易明细（trades.csv），不输出
 * 「这套配置在 2022 年之后、扣除真实成本后，期望值是否显著不为零」。这个判断
 * 此前靠临时脚本现算，同一套口径两天内被重写三次，且 ρ 的计算方式不同会让
 * t 值差一个数量级（见 docs/design/structure/structure-impl-v1.md §12.2）。
 * 本脚本把口径固化下来，任何一次回测产物都能用同一条命令复核。
 *
 * 用法：
 *   node scripts/backtest-significance.mjs <trades.csv> [--cost-bps 5] [--from 2022-01-01]
 *   node scripts/backtest-significance.mjs temp/backtest-4h/m0.2/trades.csv --cost-bps 10
 *
 * 口径定义（与文档 §9/§10/§12 一致，改动需同步文档）：
 * - 净 R：`gross_r - (bps/10) × cost_r`。`cost_r` 是按 10bp 单边记的，故 bps/10 是缩放系数。
 * - ρ：六品种「日度平均 R」的两两 Pearson 均值，**只用两个品种都有交易的日期**
 *   （零填充会把真实相关性稀释到 1/5，见 §12.2）。
 * - Neff：`N / (1 + 5ρ)`，即「六个高相关序列折成几个独立样本」的保守估计。
 * - t：`mean / (sd / sqrt(Neff))`。
 *
 * 稳健性：同时输出「剔除最大 1% 赢单后的 t」与「日期块自举 t」。
 * 前者检验结论是否只靠极少数肥尾交易撑起；后者不依赖 Neff 近似，
 * 直接按时间块重采样（块长需 ≥ 平均持仓跨度，否则重叠持仓被当成独立注）。
 */
import { readFileSync } from 'node:fs'

/** 相关性折减系数：六品种两两平均相关 ρ 对应的有效样本除数。 */
const NEFF_DIVISOR_SLOPE = 5

/** 日期块自举的默认块长（天）。4h 平均持仓约 11 天，30 天块覆盖得下。 */
const DEFAULT_BLOCK_DAYS = 30

/** 日期块自举的重采样次数。 */
const BOOTSTRAP_REPS = 3000

/** 自举随机种子（固定，保证同输入同输出）。 */
const BOOTSTRAP_SEED = 11

/** 全局样本起点。 */
const FULL_SAMPLE_START = '0000-01-01'

/**
 * 解析命令行为参数表。
 *
 * @param argv 进程参数（不含 node 与脚本路径）
 * @returns 位置参数与选项
 */
function parseArguments(argv) {
  const positional = []
  const options = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      positional.push(token)
      continue
    }
    const name = token.slice(2)
    const next = argv[index + 1]
    if (next !== undefined && !next.startsWith('--')) {
      options.set(name, next)
      index += 1
    } else {
      options.set(name, true)
    }
  }
  return { positional, options }
}

/**
 * 读取数值选项。
 *
 * @param options 选项表
 * @param name 名称
 * @param fallback 缺省值
 * @returns 数值
 */
function readNumber(options, name, fallback) {
  const raw = options.get(name)
  if (raw === undefined) return fallback
  if (raw === true) throw new Error(`选项 --${name} 需要一个值`)
  const value = Number(raw)
  if (!Number.isFinite(value)) throw new Error(`选项 --${name} 不是数字：${raw}`)
  return value
}

/**
 * 读取字符串选项。
 *
 * @param options 选项表
 * @param name 名称
 * @param fallback 缺省值
 * @returns 字符串
 */
function readString(options, name, fallback) {
  const raw = options.get(name)
  if (raw === undefined) return fallback
  if (raw === true) throw new Error(`选项 --${name} 需要一个值`)
  return raw
}

/**
 * 解析 trades.csv（简单 CSV：字段内不含逗号，由 report.ts 的 csvEscape 保证）。
 *
 * @param path 文件路径
 * @returns 交易记录数组
 */
function loadTrades(path) {
  const lines = readFileSync(path, 'utf8').trim().split('\n')
  if (lines.length < 2) {
    throw new Error(`trades.csv 没有数据行：${path}`)
  }
  const header = lines[0].split(',')
  const required = ['symbol', 'entry_time', 'gross_r', 'cost_r']
  for (const field of required) {
    if (!header.includes(field)) {
      throw new Error(`trades.csv 缺少列 ${field}：${path}`)
    }
  }
  return lines.slice(1).map((line) => {
    const fields = line.split(',')
    const row = {}
    header.forEach((name, index) => {
      row[name] = fields[index]
    })
    return row
  })
}

/**
 * 算术平均。
 *
 * @param values 数值
 * @returns 平均值
 */
function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * 样本标准差（n-1 分母）。
 *
 * @param values 数值
 * @returns 标准差
 */
function sd(values) {
  const average = mean(values)
  const squares = values.reduce((sum, value) => sum + (value - average) ** 2, 0)
  return Math.sqrt(squares / (values.length - 1))
}

/**
 * Pearson 相关系数。
 *
 * @param left 序列 A
 * @param right 序列 B
 * @returns 相关系数
 */
function pearson(left, right) {
  const meanLeft = mean(left)
  const meanRight = mean(right)
  let covariance = 0
  let varianceLeft = 0
  let varianceRight = 0
  for (let index = 0; index < left.length; index += 1) {
    covariance += (left[index] - meanLeft) * (right[index] - meanRight)
    varianceLeft += (left[index] - meanLeft) ** 2
    varianceRight += (right[index] - meanRight) ** 2
  }
  return covariance / Math.sqrt(varianceLeft * varianceRight)
}

/**
 * 净 R：把按 10bp 记录的成本缩放到目标 bps。
 *
 * @param trade 交易记录
 * @param costBps 目标单边成本
 * @returns 净 R
 */
function netR(trade, costBps) {
  return Number(trade.gross_r) - (costBps / 10) * Number(trade.cost_r)
}

/**
 * 六品种两两平均相关（只用双方都有交易的日期）。
 *
 * @param trades 交易记录
 * @param costBps 目标单边成本
 * @returns 平均相关系数与参与计算的品种对数
 */
function crossSymbolRho(trades, costBps) {
  const bySymbolDay = new Map()
  for (const trade of trades) {
    const symbol = trade.symbol
    const day = trade.entry_time.slice(0, 10)
    if (!bySymbolDay.has(symbol)) bySymbolDay.set(symbol, new Map())
    const byDay = bySymbolDay.get(symbol)
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day).push(netR(trade, costBps))
  }
  const symbols = [...bySymbolDay.keys()]
  const correlations = []
  for (let left = 0; left < symbols.length; left += 1) {
    for (let right = left + 1; right < symbols.length; right += 1) {
      const leftDays = bySymbolDay.get(symbols[left])
      const rightDays = bySymbolDay.get(symbols[right])
      const sharedDays = [...leftDays.keys()].filter((day) => rightDays.has(day))
      // 太少的重叠日算出的相关系数没有意义，直接跳过。
      if (sharedDays.length < 10) continue
      correlations.push(
        pearson(
          sharedDays.map((day) => mean(leftDays.get(day))),
          sharedDays.map((day) => mean(rightDays.get(day))),
        ),
      )
    }
  }
  return { rho: mean(correlations), pairs: correlations.length }
}

/**
 * 日期块自举：按时间块重采样，得到均值的经验标准误。
 *
 * @param values 每笔的净 R
 * @param timestamps 对应的入场时刻（毫秒）
 * @param blockDays 块长（天）
 * @returns 自举得到的 t 值
 */
function blockBootstrapT(values, timestamps, blockDays) {
  let seed = BOOTSTRAP_SEED
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const blockMs = blockDays * 86_400_000
  const start = Math.min(...timestamps)
  const end = Math.max(...timestamps)
  const blockCount = Math.ceil((end - start) / blockMs) + 1
  const buckets = Array.from({ length: blockCount }, () => [])
  timestamps.forEach((time, index) => {
    buckets[Math.floor((time - start) / blockMs)].push(values[index])
  })
  const populated = buckets.filter((bucket) => bucket.length > 0)
  const means = []
  for (let rep = 0; rep < BOOTSTRAP_REPS; rep += 1) {
    let sum = 0
    let count = 0
    for (let pick = 0; pick < populated.length; pick += 1) {
      const bucket = populated[Math.floor(random() * populated.length)]
      for (const value of bucket) {
        sum += value
        count += 1
      }
    }
    if (count > 0) means.push(sum / count)
  }
  return mean(means) / sd(means)
}

/**
 * 计算一个样本切片的全部指标。
 *
 * @param trades 交易记录
 * @param costBps 目标单边成本
 * @param blockDays 自举块长
 * @returns 指标对象
 */
function summarize(trades, costBps, blockDays) {
  const values = trades.map((trade) => netR(trade, costBps))
  const average = mean(values)
  const deviation = sd(values)
  const { rho, pairs } = crossSymbolRho(trades, costBps)
  const neff = trades.length / (1 + NEFF_DIVISOR_SLOPE * rho)
  const tCorrected = average / (deviation / Math.sqrt(neff))

  // 剔除最大 1% 赢单：检验结论是否只靠极少数肥尾交易撑起。
  const sorted = [...values].sort((left, right) => right - left)
  const trimCount = Math.max(1, Math.round(values.length * 0.01))
  const threshold = sorted[trimCount - 1]
  const trimmed = values.filter((value) => value < threshold)
  const trimmedNeff = trimmed.length / (1 + NEFF_DIVISOR_SLOPE * rho)
  const tTrimmed = mean(trimmed) / (sd(trimmed) / Math.sqrt(trimmedNeff))

  const timestamps = trades.map((trade) => new Date(trade.entry_time).getTime())
  const tBootstrap = blockBootstrapT(values, timestamps, blockDays)

  return {
    count: trades.length,
    expectancy: average,
    sd: deviation,
    rho,
    pairs,
    neff,
    tCorrected,
    tTrimmed,
    tBootstrap,
  }
}

/**
 * 格式化一行输出。
 *
 * @param label 口径标签
 * @param stats 指标
 * @param costBps 成本
 * @returns 一行文本
 */
function formatRow(label, stats, costBps) {
  return [
    label.padEnd(10),
    `N=${String(stats.count).padStart(5)}`,
    `ρ=${stats.rho.toFixed(3)}(${stats.pairs}对)`,
    `Neff=${String(Math.round(stats.neff)).padStart(5)}`,
    `@${String(costBps).padStart(2)}bp`,
    `${stats.expectancy >= 0 ? '+' : ''}${stats.expectancy.toFixed(3)}R`,
    `t=${stats.tCorrected.toFixed(2)}`,
    `剔1%=${stats.tTrimmed.toFixed(2)}`,
    `块自举=${stats.tBootstrap.toFixed(2)}`,
  ].join('  ')
}

/**
 * 入口。
 */
function main() {
  const { positional, options } = parseArguments(process.argv.slice(2))
  if (positional.length === 0) {
    throw new Error(
      '用法：node scripts/backtest-significance.mjs <trades.csv> [--cost-bps 5] [--from 2022-01-01] [--block-days 30]',
    )
  }
  const path = positional[0]
  const from = readString(options, 'from', '2022-01-01')
  const blockDays = readNumber(options, 'block-days', DEFAULT_BLOCK_DAYS)
  const costLevels = [5, 10]

  const all = loadTrades(path)
  const symbols = [...new Set(all.map((trade) => trade.symbol))].sort()
  console.log(`文件：${path}`)
  console.log(`品种：${symbols.join(', ')}（${symbols.length} 个）`)
  console.log(`总笔数：${all.length}`)
  console.log('')

  for (const costBps of costLevels) {
    const full = summarize(all, costBps, blockDays)
    console.log(formatRow('全样本', full, costBps))
    const recent = all.filter((trade) => trade.entry_time >= from)
    if (recent.length === 0) {
      console.log(`${from} 之后没有交易`)
      continue
    }
    const window = summarize(recent, costBps, blockDays)
    console.log(formatRow(`${from}+`, window, costBps))
  }

  console.log('')
  console.log('口径：净 R = gross_r - (bps/10) × cost_r；ρ 只用双方都有交易的日期；')
  console.log(
    `Neff = N/(1+${NEFF_DIVISOR_SLOPE}ρ)；t = mean/(sd/sqrt(Neff))；块自举块长 ${blockDays} 天。`,
  )
}

main()
