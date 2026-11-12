/**
 * 面板的文本渲染：把一次快照打成六块可读的表格。
 *
 * 排版原则：
 * - 数字优先，单位显式（$M / % / 倍）。
 * - 每块表格都带口径说明，尤其「最近若干笔」与「官方 1 小时聚合」不能混排。
 * - 矛盾单独成块并放最后——它的价值最高，但必须先看过上面的事实。
 */
import { type Contradiction, type OrderflowPanel, type VenueSnapshot } from '../types'
import { DEPTH_BANDS_DEFAULT } from './depth'

/** 金额格式化为 $X.XM / $X.XK。 */
function money(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

/** 百分比。 */
function pct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`
}

/** 带符号的金额。 */
function signedMoney(value: number): string {
  return `${value >= 0 ? '+' : '−'}${money(Math.abs(value))}`
}

/** 周期标签。 */
function windowLabel(seconds: number): string {
  if (seconds >= 3600) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 60)}m`
}

/**
 * 一段的总标题。
 *
 * @param title 标题
 * @returns 带分隔线的标题
 */
function section(title: string): string {
  return `\n── ${title} ──`
}

/**
 * 渲染单所快照里的失败项。
 *
 * @param venue 快照
 * @returns 失败说明；无失败返回 null
 */
function errorLine(venue: VenueSnapshot): string | null {
  if (venue.errors.length === 0) return null
  return `  ${venue.venue} 失败：${venue.errors.map((item) => `${item.kind}(${item.message})`).join('；')}`
}

/**
 * 渲染完整面板。
 *
 * @param panel 面板快照
 * @returns 多行文本
 */
export function renderPanel(panel: OrderflowPanel): string {
  const lines: string[] = []
  const stamp = new Date(panel.timestamp).toISOString().replace('T', ' ').slice(0, 19)
  lines.push(`订单流面板 · ${panel.symbol} · ${stamp}Z`)

  // ── 1. 总览 ──
  lines.push(section('① 总览'))
  lines.push(
    `  OI 合计 ${panel.totals.openInterestBase.toFixed(0)} 币 / ${money(panel.totals.openInterestNotional)}` +
      `  |  1h 净流 ${signedMoney(panel.totals.netFlow1h)}` +
      `  |  1h 主动买 ${panel.totals.takerBuyRatio1h === null ? '—' : pct(panel.totals.takerBuyRatio1h)}`,
  )
  lines.push(
    `  ±${DEPTH_BANDS_DEFAULT}% 深度 ${money(panel.totals.depthHalfPercent.bidNotional)} 买 / ${money(panel.totals.depthHalfPercent.askNotional)} 卖` +
      `  |  失衡 ${pct(panel.totals.depthHalfPercent.imbalance)}（正=买厚）`,
  )
  lines.push(
    `  账户数多空比 ${panel.totals.accountRatioMean === null ? '—' : panel.totals.accountRatioMean.toFixed(2)}` +
      `  |  大户持仓多空比 ${panel.totals.topPositionRatioMean === null ? '—' : panel.totals.topPositionRatioMean.toFixed(2)}` +
      `（>1 偏多。两者口径不同，不可合并）`,
  )

  // ── 2. 资金流 ──
  lines.push(section('② 分场所资金流（1h，官方聚合）'))
  lines.push('  交易所        净流        主动买占比')
  for (const venue of panel.venues) {
    const flow = venue.flows.find((item) => item.windowSeconds === 3600)
    if (flow === undefined) {
      lines.push(`  ${venue.venue.padEnd(12)} —（无 1h 数据）`)
      continue
    }
    if (flow.coverageSeconds < flow.windowSeconds) {
      lines.push(
        `  ${venue.venue.padEnd(12)} ${signedMoney(flow.netNotional).padStart(10)}   仅覆盖 ${Math.round(flow.coverageSeconds / 60)} 分钟（不足 1h）`,
      )
      continue
    }
    lines.push(
      `  ${venue.venue.padEnd(12)} ${signedMoney(flow.netNotional).padStart(10)}   ${pct(flow.takerBuyRatio).padStart(6)}`,
    )
  }
  for (const venue of panel.venues) {
    const line = errorLine(venue)
    if (line !== null) lines.push(line)
  }

  // ── 3. 主动买卖分周期 ──
  // 覆盖不足的周期不给百分比：那一段只代表它实际覆盖的时长，写成「1h 45%」会骗人。
  lines.push(section('③ 主动买入占比（周期越短越贴近「刚刚」）'))
  lines.push('  交易所        1h      15m     5m      1m      备注')
  for (const venue of panel.venues) {
    const byWindow = new Map(venue.flows.map((flow) => [flow.windowSeconds, flow]))
    const cell = (seconds: number): string => {
      const flow = byWindow.get(seconds)
      if (flow === undefined) return '—'
      if (flow.coverageSeconds < flow.windowSeconds) {
        return `覆盖${Math.round(flow.coverageSeconds / 60)}m`
      }
      return pct(flow.takerBuyRatio)
    }
    const granularity = venue.flows.some((flow) => flow.granularity === 'self-aggregated')
      ? '官方+自算'
      : '官方聚合'
    lines.push(
      `  ${venue.venue.padEnd(12)} ${cell(3600).padStart(6)}  ${cell(900).padStart(6)}  ${cell(300).padStart(6)}  ${cell(60).padStart(8)}  ${granularity}`,
    )
  }

  // ── 4. 深度与价格墙 ──
  lines.push(section(`④ 深度（±${DEPTH_BANDS_DEFAULT}% 内挂单，实际覆盖见「覆盖」列）`))
  lines.push('  交易所        买盘       卖盘      区间失衡  覆盖            近端失衡  最大价格墙')
  for (const venue of panel.venues) {
    const depth = venue.depth
    if (depth === null) {
      lines.push(`  ${venue.venue.padEnd(12)} —`)
      continue
    }
    const band = depth.bands.find((item) => item.band === DEPTH_BANDS_DEFAULT)
    const wall = depth.walls[0]
    const wallText =
      wall === undefined
        ? '无'
        : `${wall.side === 'bid' ? '买' : '卖'}@${wall.price.toFixed(1)} ${money(wall.notional)}`
    lines.push(
      `  ${venue.venue.padEnd(12)} ${money(band === undefined ? 0 : band.bidNotional).padStart(9)}  ${money(band === undefined ? 0 : band.askNotional).padStart(9)}  ${pct(band === undefined ? 0 : band.imbalance).padStart(7)}  −${depth.bidCoveragePct.toFixed(2)}%/+${depth.askCoveragePct.toFixed(2)}%  ${pct(depth.nearImbalance).padStart(7)}  ${wallText}`,
    )
  }

  // ── 5. 持仓结构 ──
  lines.push(section('⑤ 持仓结构'))
  lines.push('  交易所        OI(币)       OI 名义额     账户数多空比  大户持仓多空比')
  for (const venue of panel.venues) {
    const positioning = venue.positioning
    if (positioning === null) {
      lines.push(`  ${venue.venue.padEnd(12)} —`)
      continue
    }
    lines.push(
      `  ${venue.venue.padEnd(12)} ${positioning.openInterestBase.toFixed(0).padStart(8)}  ${money(positioning.openInterestNotional).padStart(11)}  ${(positioning.accountRatio === null ? '—' : positioning.accountRatio.toFixed(2)).padStart(9)}      ${(positioning.topPositionRatio === null ? '—' : positioning.topPositionRatio.toFixed(2)).padStart(9)}`,
    )
  }

  // ── 6. 大单分层 ──
  // 两种口径共用同一块：整点封存的钟级记录跨度是一小时，实时快照只有几十秒。
  // 不区分会让读者把「最近 40 秒」当成「这一小时」，两者能差 30 个百分点。
  lines.push(section('⑥ 大单分层'))
  let hasBuckets = false
  for (const venue of panel.venues) {
    const profile = venue.largeOrders
    if (profile === null) continue
    hasBuckets = true
    const hourly = profile.spanMs >= 3_600_000
    const scope = hourly
      ? `整点封存 / 小时累计 ${profile.trades} 笔 / 主动买 ${pct(profile.takerBuyRatio)}`
      : `实时快照 / 最近 ${profile.trades} 笔 / 跨度 ${(profile.spanMs / 1000).toFixed(0)}s / 主动买 ${pct(profile.takerBuyRatio)}`
    const warning = hourly ? '' : '  ⚠ 秒级快照，非小时级分布'
    lines.push(`  ${venue.venue}（${scope}）${warning}`)
    for (const bucket of profile.buckets) {
      const range =
        bucket.maxNotional === null
          ? `≥${money(bucket.minNotional)}`
          : `${money(bucket.minNotional)}–${money(bucket.maxNotional)}`
      const buyText = bucket.notional > 0 ? pct(bucket.takerBuyRatio) : '—'
      lines.push(
        `    ${range.padEnd(16)} ${pct(bucket.share).padStart(6)}  主动买 ${buyText.padStart(6)}`,
      )
    }
  }
  if (!hasBuckets) lines.push('  无（该组合下没有可用的逐笔成交流）')

  // ── 7. 矛盾 ──
  lines.push(section('⑦ 互相打架的证据'))
  if (panel.contradictions.length === 0) {
    lines.push('  未检出。各面板方向一致，或差异未超过阈值。')
  } else {
    for (const contradiction of panel.contradictions) {
      lines.push(`  • [${contradiction.kind}] ${contradiction.detail}`)
    }
  }

  lines.push('')
  lines.push('口径说明：')
  lines.push('  · 深度只用「实际覆盖范围内的挂单」，各所档数上限不同，覆盖不足的区间标为截断。')
  lines.push(
    '  · 「主动买占比」优先用交易所官方聚合（Binance 1m K 线、OKX RUBIK）；官方没有的周期，',
  )
  lines.push('    由我们按分钟累加逐笔成交再向上聚合，标注「官方+自算」，覆盖不足时只报覆盖时长。')
  lines.push('  · 账户数多空比与大户持仓多空比是两种口径，实测方向可以相反，分开显示。')
  return lines.join('\n')
}

/**
 * 把矛盾列表打成单行摘要，便于日志。
 *
 * @param contradictions 矛盾
 * @returns 摘要
 */
export function summarizeContradictions(contradictions: readonly Contradiction[]): string {
  if (contradictions.length === 0) return '无矛盾'
  return contradictions.map((item) => item.kind).join(', ')
}
