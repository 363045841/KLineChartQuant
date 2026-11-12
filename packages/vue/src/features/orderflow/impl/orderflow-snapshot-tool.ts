// 把订单流面板包装成 Agent 可调用的只读工具。
//
// 这个工具最容易造成的伤害不是报错，而是**让模型把面板数字读成买卖结论**。
// 因此描述里写死了阶段 0 的检验结果：那套组合在去重后 12h/24h 都不显著，
// 七年只有 2022 年一年显著。模型据此只会陈述事实与矛盾，不会给方向。

import type { RuntimeToolDefinition } from '@363045841yyt/klinechart-agent-runtime'
import { Type } from 'typebox'
import type { OrderflowPanelSource } from '../types.js'

/** 工具名。 */
export const ORDERFLOW_SNAPSHOT_TOOL_NAME = 'orderflow_snapshot'

/** 永续合约的展示后缀：图表上显示 `BTCUSDT.P`，订单流数据用 `BTCUSDT`。 */
const PERPETUAL_DISPLAY_SUFFIX = '.P'

/** 工具元数据。 */
export const ORDERFLOW_SNAPSHOT_TOOL_METADATA = {
  name: ORDERFLOW_SNAPSHOT_TOOL_NAME,
  label: 'Read orderflow panel',
  description:
    'Read the aggregated order-flow panel for a symbol: open interest, taker buy/sell split, ' +
    'order-book depth and price walls, long/short ratios, and the contradictions between them. ' +
    'The data comes from five venues (Binance, OKX, Bybit, Bitget, Hyperliquid) sampled every 60 seconds. ' +
    'IMPORTANT: this panel is an observational aid, NOT a trading signal. ' +
    'Historical test of the "crowded longs + aggressive selling + flat open interest" pattern: ' +
    'after de-duplicating overlapping events it showed no significant forward returns ' +
    '(win rate 49.8%, t 0.09; only 2022 out of seven years was significant, and that was bear-market beta). ' +
    'Report the facts and contradictions, and say plainly when the numbers disagree with each other. ' +
    'Do not turn the panel into buy or sell advice.',
} as const

const OrderflowSnapshotParameters = Type.Object(
  {
    symbol: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 32,
        description:
          'Trading pair such as BTCUSDT or ETHUSDT. Omit to use the symbol currently on the chart.',
      }),
    ),
    format: Type.Optional(
      Type.Union([Type.Literal('text'), Type.Literal('json')], {
        description: 'text (default) returns the readable panel; json returns the raw snapshot.',
      }),
    ),
  },
  { additionalProperties: false },
)

type OrderflowSnapshotInput = {
  readonly symbol?: string
  readonly format?: 'text' | 'json'
}

/**
 * 去掉永续展示后缀，得到订单流数据用的交易对。
 *
 * @param label 图表上的品种代码
 * @returns 交易对；无法识别时为 null
 */
export function normalizeOrderflowSymbol(label: string | null | undefined): string | null {
  if (typeof label !== 'string') return null
  const trimmed = label.trim()
  if (trimmed === '') return null
  const upper = trimmed.toUpperCase()
  const withoutSuffix = upper.endsWith(PERPETUAL_DISPLAY_SUFFIX)
    ? upper.slice(0, -PERPETUAL_DISPLAY_SUFFIX.length)
    : upper
  return withoutSuffix === '' ? null : withoutSuffix
}

/**
 * 创建订单流面板工具。
 *
 * @param source 面板数据来源
 * @param currentSymbol 取当前图表品种（用于省略 symbol 参数时）
 * @returns 只读工具定义
 */
export function createOrderflowSnapshotTool(
  source: OrderflowPanelSource,
  currentSymbol: () => string | null,
): RuntimeToolDefinition {
  return {
    ...ORDERFLOW_SNAPSHOT_TOOL_METADATA,
    parameters: OrderflowSnapshotParameters,
    safety: 'read-only',
    reversible: false,
    executionMode: 'parallel',
    summarizeInput: (input) => {
      const value = input as OrderflowSnapshotInput
      return value.symbol ?? 'current symbol'
    },
    async execute(input, context) {
      const request = input as OrderflowSnapshotInput
      context.signal.throwIfAborted()
      const symbol = normalizeOrderflowSymbol(request.symbol ?? currentSymbol())
      if (symbol === null) {
        return {
          content: '没有可用的交易对。请传入 symbol（例如 BTCUSDT），或先让图表显示一个品种。',
          summary: '缺少交易对。',
        }
      }
      context.progress({ label: `读取订单流面板 ${symbol}`, current: 1, total: 1 })
      try {
        if (request.format === 'json') {
          const panel = await source.fetchPanel(symbol, context.signal)
          return {
            content: JSON.stringify(panel),
            summary: `已返回 ${symbol} 的面板快照。`,
          }
        }
        const text = await source.fetchPanelText(symbol, context.signal)
        return {
          content: text,
          summary: `已返回 ${symbol} 的订单流面板。`,
        }
      } catch (error) {
        context.signal.throwIfAborted()
        const reason = error instanceof Error ? error.message : String(error)
        return {
          content:
            `读取订单流面板失败：${reason}。` +
            '订单流采集与只读服务是独立进程，未启动时本工具不可用。' +
            '请告知用户检查采集器与 `analytics serve` 的运行状态，不要凭猜测给出面板数字。',
          summary: '订单流服务不可用。',
          failure: {
            code: 'TOOL_ERROR',
            message: 'Orderflow panel is unavailable.',
            retryable: true,
          },
        }
      }
    },
  }
}
