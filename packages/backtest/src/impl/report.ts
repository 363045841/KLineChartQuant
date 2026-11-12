/**
 * 报告输出：JSON 明细、Markdown 报告、逐笔交易 CSV。
 *
 * 输出的三个文件是同一份 `BacktestReport` 的三种视图：
 * - report.json：机读全量（含配置、交叉验证、分组统计）
 * - report.md：人读表格
 * - trades.csv：逐笔交易明细
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BacktestReport, PerformanceStats, TradeRecord } from '../types'

/**
 * 数字格式化。
 *
 * @param value 数值
 * @param digits 小数位
 * @returns 字符串；null 显示为 `—`
 */
function num(value: number | null, digits: number): string {
  return value === null ? '—' : value.toFixed(digits)
}

/**
 * 百分比格式化。
 *
 * @param value 小数
 * @param digits 小数位
 * @returns 百分比字符串
 */
function pct(value: number | null, digits: number = 2): string {
  return value === null ? '—' : `${(value * 100).toFixed(digits)}%`
}

/**
 * 统计行（Markdown 表格）。
 *
 * @param label 行名
 * @param stats 统计
 * @returns 表格行
 */
function statsRow(label: string, stats: PerformanceStats): string {
  return `| ${label} | ${stats.trades} | ${num(stats.expectancyR, 3)} | ${num(stats.totalR, 2)} | ${num(stats.profitFactor, 2)} | ${pct(stats.winRate)} | ${num(stats.maxDrawdownR, 2)} | ${num(stats.avgBarsHeld, 1)} |`
}

/**
 * 生成 Markdown 报告。
 *
 * @param report 回测报告
 * @param trades 全部交易（用于结局分布）
 * @returns Markdown 文本
 */
function renderMarkdown(report: BacktestReport, trades: readonly TradeRecord[]): string {
  const lines: string[] = []
  const sourceLabel = report.config.signalSource === 'smc-break' ? '结构破位' : 'L2（一目替身）'
  lines.push(`# 回测报告：${report.config.timeframe} ${sourceLabel} + 期权位 A/B 分级`)
  lines.push('')
  lines.push(`- 生成时间：${report.generatedAt}`)
  lines.push(
    `- 周期：${report.config.timeframe}；目标：${report.config.target1R}R / ${report.config.target2R}R；最长持仓：${report.config.maxBars} bar`,
  )
  lines.push(
    `- 成本：${report.config.costBpsPerSide} bp/边（手续费与滑点合并，入场与出场各收一次）`,
  )
  const missedStopSignals = report.results.reduce(
    (sum, result) => sum + result.missedStopSignalCount,
    0,
  )
  const filteredSignals = report.results.reduce(
    (sum, result) => sum + result.filteredSignalCount,
    0,
  )
  const stopText =
    report.config.stopSource === 'structure'
      ? `最近一个已确认的反向枢轴（窗口 ±${report.config.pivotLookback} bar）`
      : '多头云下沿、空头云上沿'
  lines.push(
    `- 入场：信号 bar 收盘价；止损：${stopText}；A 级容差：${report.config.cloudToleranceRatio} × 云厚`,
  )
  lines.push(
    `- 闸门：无止损位 ${missedStopSignals} 个；止损距离 < ${pct(report.config.minStopDistanceRatio, 2)} 的 ${filteredSignals} 个。被剔除的信号仍参与反向失效判定。`,
  )
  lines.push('')

  lines.push('## 一、信号数交叉验证（与 report-v2 对照）')
  lines.push('')
  lines.push('| 品种 | 周期 | 引擎信号数 | 参考信号数 | 引擎每周 | 参考每周 | 一致 |')
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | --- |')
  for (const row of report.crossValidation.rows) {
    lines.push(
      `| ${row.symbol} | ${row.timeframe} | ${row.engineSignals} | ${row.referenceSignals ?? '—'} | ${num(row.enginePerWeek, 3)} | ${num(row.referencePerWeek, 3)} | ${row.matched ? '✅' : '❌'} |`,
    )
  }
  lines.push('')
  const comparableRows = report.crossValidation.rows.filter((row) => row.referenceSignals !== null)
  if (comparableRows.length === 0) {
    lines.push('参考文件不含该周期的数据，本项不做比对。')
  } else {
    lines.push(
      `参考文件：\`${report.crossValidation.reference}\`；总体：${report.crossValidation.matched ? '✅ 全部一致' : '❌ 存在偏差'}`,
    )
  }
  lines.push('')

  lines.push(`## 二、核心指标（全历史，已扣 ${report.config.costBpsPerSide} bp/边）`)
  lines.push('')
  lines.push('| 组合 | 笔数 | 期望值(R) | 总 R | PF | 胜率 | 最大回撤(R) | 平均持仓(bar) |')
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
  for (const result of report.results) {
    lines.push(statsRow(result.symbol, result.stats))
  }
  lines.push(statsRow('合计', report.combined.stats))
  lines.push('')

  lines.push('## 三、成本敏感度（按单边 bps 精确重算）')
  lines.push('')
  lines.push(
    '成本口径：单边名义金额 × bps，入场与出场各收一次；只改 R 记账，不改止损/目标的触及判定。结算成本 = ' +
      `${report.config.costBpsPerSide} bp/边。`,
  )
  lines.push('')
  const symbols = report.results.map((result) => result.symbol)
  lines.push(
    `| 单边成本(bp) | ${symbols.join(' 期望(R) | ')} 期望(R) | 合计期望(R) | 合计 PF | 合计胜率 |`,
  )
  lines.push(`| ---: | ${symbols.map(() => '---: |').join(' ')} ---: | ---: | ---: |`)
  for (const point of report.costSensitivity.levels) {
    const perSymbol = symbols
      .map((symbol) => {
        const level = report.results
          .find((result) => result.symbol === symbol)!
          .costSensitivity.levels.find((item) => item.costBpsPerSide === point.costBpsPerSide)
        return num(level === undefined ? null : level.expectancyR, 3)
      })
      .join(' | ')
    lines.push(
      `| ${point.costBpsPerSide} | ${perSymbol} | ${num(point.expectancyR, 3)} | ${num(point.profitFactor, 2)} | ${pct(point.winRate)} |`,
    )
  }
  lines.push('')
  for (const result of report.results) {
    lines.push(
      `- ${result.symbol} 盈亏平衡：${
        result.costSensitivity.breakevenBpsPerSide === null
          ? '无正期望，任何非负成本都为负'
          : `${num(result.costSensitivity.breakevenBpsPerSide, 1)} bp/边`
      }（每 1 bp/边折算 ${num(result.costSensitivity.costRPerBps, 5)} R）`,
    )
  }
  lines.push(
    `- 合计盈亏平衡：${
      report.costSensitivity.breakevenBpsPerSide === null
        ? '无正期望，任何非负成本都为负'
        : `${num(report.costSensitivity.breakevenBpsPerSide, 1)} bp/边`
    }`,
  )
  lines.push('')
  lines.push(
    '**读法**：现货 taker 往返约 20 bp（单边 10 bp）、合约 taker 往返约 10 bp（单边 5 bp）；表中期望值越过 0 的那一档就是策略的成本承受上限。',
  )
  lines.push('')

  lines.push('## 四、A 级 vs B 级（仅期权窗口内有分级的交易）')
  lines.push('')
  lines.push('| 组合 | 级别 | 笔数 | 期望值(R) | 总 R | PF | 胜率 | 最大回撤(R) | 平均持仓(bar) |')
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
  for (const result of report.results) {
    for (const grade of ['A', 'B'] as const) {
      const stats = result.byGrade[grade]
      lines.push(
        `| ${result.symbol} | ${grade} | ${stats.trades} | ${num(stats.expectancyR, 3)} | ${num(stats.totalR, 2)} | ${num(stats.profitFactor, 2)} | ${pct(stats.winRate)} | ${num(stats.maxDrawdownR, 2)} | ${num(stats.avgBarsHeld, 1)} |`,
      )
    }
  }
  lines.push('')
  lines.push('A/B 只在有期权快照的窗口内可判定；窗口外的信号记为无分级（不计入本表）。')
  lines.push('')

  lines.push('## 五、买入持有对比')
  lines.push('')
  lines.push('| 品种 | 起始价 | 结束价 | 总收益 | 年化 | 覆盖天数 |')
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |')
  for (const result of report.results) {
    const hold = result.buyHold
    lines.push(
      `| ${result.symbol} | ${hold.startPrice.toFixed(2)} | ${hold.endPrice.toFixed(2)} | ${pct(hold.totalReturn)} | ${pct(hold.cagr)} | ${hold.days.toFixed(0)} |`,
    )
  }
  lines.push('')
  lines.push(
    '注意：策略口径是「每笔 R」，买入持有是「价格收益率」；两者单位不同，不能直接相减。策略若要和持有比较，需要先确定仓位与风险预算（第一版不做）。',
  )
  lines.push('')

  lines.push('## 六、随机入场基准（同方向比例、同结算规则）')
  lines.push('')
  lines.push('| 品种 | 采样笔数 | 多头比例 | 期望值(R) | PF | 胜率 |')
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |')
  for (const result of report.results) {
    const random = result.randomEntry
    lines.push(
      `| ${random.symbol} | ${random.samples} | ${pct(random.longRatio)} | ${num(random.stats.expectancyR, 3)} | ${num(random.stats.profitFactor, 2)} | ${pct(random.stats.winRate)} |`,
    )
  }
  lines.push('')

  lines.push('## 七、结局分布')
  lines.push('')
  lines.push('| 品种 | hit_target | hit_stop | invalidated | expired |')
  lines.push('| --- | ---: | ---: | ---: | ---: |')
  for (const result of report.results) {
    const counts = { hit_target: 0, hit_stop: 0, invalidated: 0, expired: 0 }
    for (const trade of trades.filter((item) => item.symbol === result.symbol)) {
      counts[trade.outcome] += 1
    }
    lines.push(
      `| ${result.symbol} | ${counts.hit_target} | ${counts.hit_stop} | ${counts.invalidated} | ${counts.expired} |`,
    )
  }
  lines.push('')

  lines.push('## 八、数据覆盖')
  lines.push('')
  lines.push('| 品种 | K 线 bar 数 | 起 | 止 |')
  lines.push('| --- | ---: | --- | --- |')
  for (const [symbol, data] of Object.entries(report.data.klines)) {
    lines.push(`| ${symbol} | ${data.bars} | ${data.first} | ${data.last} |`)
  }
  lines.push('')
  lines.push('| 期权来源 | 快照数 | 起 | 止 |')
  lines.push('| --- | ---: | --- | --- |')
  for (const [symbol, data] of Object.entries(report.data.optionSnapshots)) {
    lines.push(`| ${symbol} | ${data.records} | ${data.first} | ${data.last} |`)
  }
  lines.push('')

  lines.push('## 九、假设与未实现项')
  lines.push('')
  for (const caveat of report.caveats) {
    lines.push(`- ${caveat}`)
  }
  lines.push('')
  return lines.join('\n')
}

/**
 * CSV 字段转义。
 *
 * @param value 原始值
 * @returns 可安全拼接的字符串
 */
function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replaceAll('"', '""')}"`
  }
  return value
}

/**
 * 写出报告三件套。
 *
 * @param report 报告
 * @param outDir 输出目录
 * @returns 三个文件的路径
 */
export function writeReports(
  report: BacktestReport,
  outDir: string,
): { jsonPath: string; mdPath: string; csvPath: string } {
  mkdirSync(outDir, { recursive: true })

  const trades: TradeRecord[] = report.results.flatMap((result) => result.trades)
  const jsonPath = join(outDir, 'report.json')
  const mdPath = join(outDir, 'report.md')
  const csvPath = join(outDir, 'trades.csv')

  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8')
  writeFileSync(mdPath, renderMarkdown(report, trades), 'utf8')

  const header = [
    'id',
    'symbol',
    'direction',
    'grade',
    'signal_index',
    'entry_index',
    'exit_index',
    'entry_time',
    'exit_time',
    'entry_price',
    'stop_price',
    'target1',
    'target2',
    'risk_per_unit',
    'exit_price',
    'outcome',
    'gross_r',
    'cost_r',
    'r_multiple',
    'bars_held',
    'max_favorable_r',
    'max_adverse_r',
    'reached_target2',
    'managed_outcome',
  ].join(',')
  const rows = trades.map((trade) =>
    [
      trade.id,
      trade.symbol,
      trade.direction,
      trade.grade ?? '',
      trade.signalIndex,
      trade.entryIndex,
      trade.exitIndex,
      new Date(trade.entryTime).toISOString(),
      new Date(trade.exitTime).toISOString(),
      trade.entryPrice,
      trade.stopPrice,
      trade.target1,
      trade.target2,
      trade.riskPerUnit,
      trade.exitPrice,
      trade.outcome,
      trade.grossR,
      trade.costR,
      trade.rMultiple,
      trade.barsHeld,
      trade.maxFavorableR,
      trade.maxAdverseR,
      trade.reachedTarget2,
      trade.managedOutcome === null ? 'unimplemented' : String(trade.managedOutcome),
    ]
      .map((value) => csvEscape(String(value)))
      .join(','),
  )
  writeFileSync(csvPath, `${header}\n${rows.join('\n')}\n`, 'utf8')

  return { jsonPath, mdPath, csvPath }
}
