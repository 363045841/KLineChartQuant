// 本文件将宿主提供的品种目录查询能力封装为可注册给 Agent 的只读工具。
import { AgentRuntimeError } from '../contracts/errors.js'
import { Type } from 'typebox'
import { Value } from 'typebox/value'

import type { RuntimeToolDefinition } from '../pi/types.js'

const INSTRUMENT_NAME_QUERY_TOOL_NAME = 'instruments.queryName'
const INSTRUMENT_NAME_QUERY_LIMIT = 20

/** 宿主向 Agent Runtime 注入的品种目录查询端口，隔离 Core 包依赖。 */
export interface InstrumentNameQueryToolPort {
  searchInstruments(input: {
    readonly keyword: string
    readonly limit: number
    readonly sourceIds?: ReadonlyArray<string>
    readonly signal?: AbortSignal
  }): Promise<
    ReadonlyArray<{
      readonly symbol: string
      readonly name: string
      readonly sourceId: string
      readonly exchange: string
    }>
  >
}

const InstrumentNameQueryParameters = Type.Object({
  symbol: Type.String({ minLength: 1 }),
  sourceIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
})

/** 创建按证券代码精确查询证券名称的只读工具。 */
export function createInstrumentNameQueryTool(
  port: InstrumentNameQueryToolPort,
): RuntimeToolDefinition<typeof InstrumentNameQueryParameters> {
  return {
    name: INSTRUMENT_NAME_QUERY_TOOL_NAME,
    label: 'Query instrument name',
    description:
      'Look up security names by an exact stock symbol through the active market-data sources. Optionally restrict the search to sourceIds. Return every exact symbol match with its source and exchange; never infer a name from a partial match.',
    parameters: InstrumentNameQueryParameters,
    safety: 'read-only',
    reversible: false,
    executionMode: 'parallel',
    summarizeInput: (input) => {
      if (!Value.Check(InstrumentNameQueryParameters, input)) return 'Invalid instrument name query input'
      return `Query name for ${input.symbol}`
    },
    execute: async (input, context) => {
      if (!Value.Check(InstrumentNameQueryParameters, input)) {
        throw new AgentRuntimeError('INVALID_PAYLOAD', 'The instrument name query input is invalid.')
      }
      const symbol = input.symbol.trim()
      if (!symbol) {
        throw new AgentRuntimeError('INVALID_PAYLOAD', 'The instrument symbol must not be blank.')
      }
      context.signal.throwIfAborted()
      context.progress({ label: 'Looking up instrument name', current: 1, total: 1 })
      const instruments = await port.searchInstruments({
        keyword: symbol,
        limit: INSTRUMENT_NAME_QUERY_LIMIT,
        sourceIds: input.sourceIds,
        signal: context.signal,
      })
      context.signal.throwIfAborted()
      const matches = instruments.filter((instrument) => instrument.symbol === symbol)
      if (matches.length === 0) {
        return { content: `No exact instrument match found for ${symbol}.`, summary: 'No exact match found.' }
      }
      return {
        content: matches
          .map((instrument) => `${instrument.symbol}\t${instrument.name}\t${instrument.exchange}\t${instrument.sourceId}`)
          .join('\n'),
        summary: `Returned ${matches.length} exact instrument match${matches.length === 1 ? '' : 'es'}.`,
      }
    },
  }
}
