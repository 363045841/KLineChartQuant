// 本文件将宿主提供的指标查询能力封装为可注册给 Agent 的只读工具。
import { AgentRuntimeError } from '../contracts/errors.js'
import { Type } from 'typebox'
import { Value } from 'typebox/value'

import type { RuntimeToolDefinition } from '../pi/types.js'

const INDICATOR_QUERY_TOOL_NAME = 'indicators.query'
const INDICATOR_QUERY_DEFAULT_LIMIT = 20
const INDICATOR_QUERY_MAX_LIMIT = 2000

/** 宿主向 Agent Runtime 注入的指标查询端口，隔离 Core 包依赖。 */
export interface IndicatorQueryToolPort {
  queryIndicator(input: {
    readonly definitionId: string
    readonly params?: Readonly<Record<string, number>>
    readonly from?: number
    readonly to?: number
    readonly limit?: number
  }): Promise<string>
}

const IndicatorQueryParameters = Type.Object({
  definitionId: Type.String({ minLength: 1 }),
  params: Type.Optional(Type.Record(Type.String(), Type.Number())),
  from: Type.Optional(Type.Number()),
  to: Type.Optional(Type.Number()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: INDICATOR_QUERY_MAX_LIMIT })),
})

/** 创建调用宿主指标查询端口的只读工具。 */
export function createIndicatorQueryTool(
  port: IndicatorQueryToolPort,
): RuntimeToolDefinition<typeof IndicatorQueryParameters> {
  return {
    name: INDICATOR_QUERY_TOOL_NAME,
    label: 'Query indicator',
    description:
      'Calculate a registered chart indicator over the active K-line data and return compact text. Use definitionId, optional numeric calculation params, an optional inclusive timestamp range, and a bounded result limit.',
    parameters: IndicatorQueryParameters,
    safety: 'read-only',
    reversible: false,
    executionMode: 'parallel',
    summarizeInput: (input) => {
      if (!Value.Check(IndicatorQueryParameters, input)) return 'Invalid indicator query input'
      return `Query ${input.definitionId}`
    },
    execute: async (input, context) => {
      if (!Value.Check(IndicatorQueryParameters, input)) {
        throw new AgentRuntimeError('INVALID_PAYLOAD', 'The indicator query input is invalid.')
      }
      context.signal.throwIfAborted()
      context.progress({ label: 'Calculating indicator', current: 1, total: 1 })
      const content = await port.queryIndicator(input)
      context.signal.throwIfAborted()
      return {
        content,
        summary: `Returned ${input.limit ?? INDICATOR_QUERY_DEFAULT_LIMIT} indicator entries.`,
      }
    },
  }
}
