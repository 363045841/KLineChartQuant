// 把期权关键位包装成 Agent 可调用的只读工具。
//
// 与订单流工具同样的风险：模型容易把「墙位」读成支撑阻力结论。
// 描述里写死了口径：墙位 = 该方向持仓最集中的行权价，翻转位 = 净 GEX 过零的现价，
// 两者都是观察锚点；数据只覆盖有期权源的标的（当前是 BTC 与 ETH）。

import { resolveOptionUnderlying } from '@363045841yyt/klinechart-core'
import type { RuntimeToolDefinition } from '@363045841yyt/klinechart-agent-runtime'
import { Type } from 'typebox'
import type { OptionLevelSetView, OptionPanelSource, OptionPanelView } from '../types.js'
import { describeOptionLevels } from './option-summary.js'
import { parseOptionSeries } from './parse-option-series.js'

/** 工具名。 */
export const OPTION_SNAPSHOT_TOOL_NAME = 'option_snapshot'

/** 工具元数据。 */
export const OPTION_SNAPSHOT_TOOL_METADATA = {
  name: OPTION_SNAPSHOT_TOOL_NAME,
  label: 'Read option levels',
  description:
    'Read the Deribit option levels of one underlying: gamma flip (the spot where net GEX crosses zero), ' +
    'call and put walls (the strike holding the most open interest on that side), max pain, near-term ATM ' +
    'implied volatility, DTE, the ±1σ / ±2σ expected move, the Put/Call open-interest ratio and net GEX. ' +
    'Only BTC and ETH have an option source today. The collector samples once per minute and the panel reads ' +
    'the latest row, so the numbers are at most a few minutes old. ' +
    'IMPORTANT: these are observation anchors, NOT trading signals. A wall marks where open interest is ' +
    'concentrated, not a guaranteed support or resistance; the gamma flip describes how dealer hedging behaves, ' +
    'not the direction price will take. Report the levels, the distance from spot, and the volatility context; ' +
    'do not turn them into entries, stops or targets.',
} as const

const OptionSnapshotParameters = Type.Object(
  {
    currency: Type.Optional(
      Type.String({
        minLength: 2,
        maxLength: 16,
        description:
          'Option underlying such as BTC or ETH. Omit to derive it from the symbol currently on the chart.',
      }),
    ),
    format: Type.Optional(
      Type.Union([Type.Literal('text'), Type.Literal('json')], {
        description: 'text (default) returns a readable report; json returns the parsed snapshot.',
      }),
    ),
  },
  { additionalProperties: false },
)

/** 判断是否为普通对象；模型给的参数已过 Schema，这里只做类型收敛。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 读取显式传入的标的。
 *
 * @param input 工具输入
 * @returns 标的原文；未传或不是字符串时为 undefined
 */
function readCurrency(input: unknown): string | undefined {
  if (!isRecord(input)) return undefined
  const value = input.currency
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/**
 * 读取输出格式。
 *
 * @param input 工具输入
 * @returns json 或默认的 text
 */
function readFormat(input: unknown): 'text' | 'json' {
  if (!isRecord(input)) return 'text'
  return input.format === 'json' ? 'json' : 'text'
}

/**
 * 把请求里的标的收成期权标的。
 *
 * 既接受品种代码（BTCUSDT、BTCUSDT.P），也接受直接写标的（BTC）；
 * 前者走宿主映射表，后者按大写原样交给服务，由服务决定有没有数据。
 *
 * @param requested 请求里的标的
 * @param fallback 省略参数时的回落来源
 * @returns 期权标的；两者都拿不到时为 null
 */
function resolveCurrency(requested: string | undefined, fallback: () => string | null): string | null {
  if (requested === undefined) return fallback()
  const mapped = resolveOptionUnderlying(requested)
  if (mapped !== null) return mapped
  const upper = requested.trim().toUpperCase()
  return upper === '' ? null : upper
}

/**
 * 价格文本。
 *
 * @param value 价格；null 显示破折号
 * @returns 千分位文本
 */
function price(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/**
 * 一套关键位的一行摘要。
 *
 * @param label 口径名（近月 / 全链）
 * @param levels 关键位
 * @returns 一行文本
 */
function levelLine(label: string, levels: OptionLevelSetView): string {
  const gammaWall = (side: OptionLevelSetView['callGammaWall']): string =>
    side === null ? '—' : price(side.strike)
  const oiWall = (side: OptionLevelSetView['callWall']): string =>
    side === null ? '—' : `${price(side.strike)}（OI ${side.openInterest.toFixed(1)}）`
  return (
    `${label}：翻转 ${price(levels.gammaFlipUsd)} | ` +
    `Call 墙 ${gammaWall(levels.callGammaWall)}（Γ 加权）/ ${oiWall(levels.callWall)}（OI） | ` +
    `Put 墙 ${gammaWall(levels.putGammaWall)}（Γ 加权）/ ${oiWall(levels.putWall)}（OI） | ` +
    `痛点 ${price(levels.maxPainUsd)}`
  )
}

/**
 * 生成给模型读的纯文本报告。
 *
 * 第一行是一句人话解读，后面按口径分行，便于模型引用具体数字。
 *
 * @param view 面板视图
 * @returns 多行报告
 */
function formatReport(view: OptionPanelView): string {
  const nearTerm = view.nearTerm
  const chain = view.allChain
  const lines = [
    describeOptionLevels(view),
    levelLine('近月', nearTerm),
    levelLine('全链', chain),
    `波动：ATM IV ${nearTerm.atmIvPercent === null ? '—' : `${nearTerm.atmIvPercent.toFixed(1)}%`}` +
      ` | DTE ${nearTerm.dteDays === null ? '—' : `${nearTerm.dteDays.toFixed(2)} 天`}` +
      ` | 到期 ${nearTerm.expiryIso ?? '—'}` +
      ` | ±1σ ${price(nearTerm.sigmaLowerUsd)}–${price(nearTerm.sigmaUpperUsd)}` +
      ` | ±2σ ${price(nearTerm.sigma2LowerUsd)}–${price(nearTerm.sigma2UpperUsd)}`,
    `持仓：近月 P/C ${nearTerm.putCallOiRatio?.toFixed(2) ?? '—'} | 张数 ${price(nearTerm.totalOpenInterest)}` +
      ` | 全链 P/C ${chain.putCallOiRatio?.toFixed(2) ?? '—'} | 张数 ${price(chain.totalOpenInterest)}`,
    `采集：${new Date(view.capturedAt).toISOString()}（翻转位来源 ${view.gammaFlipSource ?? '—'}）`,
  ]
  return lines.join('\n')
}

/**
 * 创建期权关键位工具。
 *
 * @param source 期权数据来源
 * @param currentUnderlying 取当前图表的期权标的（省略 currency 参数时使用）
 * @returns 只读工具定义
 */
export function createOptionSnapshotTool(
  source: OptionPanelSource,
  currentUnderlying: () => string | null,
): RuntimeToolDefinition {
  return {
    ...OPTION_SNAPSHOT_TOOL_METADATA,
    parameters: OptionSnapshotParameters,
    safety: 'read-only',
    reversible: false,
    executionMode: 'parallel',
    summarizeInput: (input) => {
      const currency = readCurrency(input)
      return currency === undefined ? 'current underlying' : currency.toUpperCase()
    },
    async execute(input, context) {
      context.signal.throwIfAborted()
      const currency = resolveCurrency(readCurrency(input), currentUnderlying)
      if (currency === null) {
        return {
          content:
            '没有可用的期权标的。请传入 currency（BTC 或 ETH），' +
            '或先让图表显示有期权源的品种（例如 BTCUSDT 永续）。',
          summary: '缺少期权标的。',
        }
      }
      context.progress({ label: `读取期权关键位 ${currency}`, current: 1, total: 1 })
      try {
        const view = parseOptionSeries(await source.fetchSeries(currency, context.signal))
        if (view === null) {
          return {
            content:
              `没有取到 ${currency} 的期权快照。` +
              '该标的可能没有期权源，或采集器尚未写入数据。' +
              '不要凭猜测给出关键位，请告知用户这一点。',
            summary: `没有 ${currency} 的期权数据。`,
          }
        }
        if (readFormat(input) === 'json') {
          return {
            content: JSON.stringify(view),
            summary: `已返回 ${currency} 的期权快照。`,
          }
        }
        return {
          content: formatReport(view),
          summary: `已返回 ${currency} 的期权关键位。`,
        }
      } catch (error) {
        context.signal.throwIfAborted()
        const reason = error instanceof Error ? error.message : String(error)
        return {
          content:
            `读取期权关键位失败：${reason}。` +
            '期权数据由 NAS 采集器写入 `options/aggregate`，再由 `analytics serve` 的 /options/series 提供；' +
            '两者任一未运行都会失败。请告知用户检查采集器与服务状态，不要凭猜测给出关键位。',
          summary: '期权服务不可用。',
          failure: {
            code: 'TOOL_ERROR',
            message: 'Option levels are unavailable.',
            retryable: true,
          },
        }
      }
    },
  }
}
