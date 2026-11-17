/** 对比品种工具：唯一写原语在 ComparisonCommands，工具只声明读写契约。 */
import { Type } from 'typebox'

import { KNOWN_INSTRUMENT_TYPES } from '../../../../data/provider/types.js'
import type { ComparisonCommandsApi } from '../../../../engine/data/comparisonCommands.js'
import type { ChartToolDefinition, ChartToolMetadata } from '../types.js'
import { jsonResult, requireFields } from './helpers.js'

const InstrumentTypeParameter = Type.Enum(KNOWN_INSTRUMENT_TYPES)

const ComparisonsWriteParameters = Type.Object(
  {
    action: Type.Union([Type.Literal('create'), Type.Literal('remove'), Type.Literal('clear')]),
    symbol: Type.Optional(Type.String({ minLength: 1 })),
    market: Type.Optional(Type.String({ minLength: 1 })),
    exchange: Type.Optional(Type.String({ minLength: 1 })),
    source: Type.Optional(Type.String({ minLength: 1 })),
    instrumentType: Type.Optional(InstrumentTypeParameter),
    period: Type.Optional(Type.String({ minLength: 1 })),
    adjust: Type.Optional(Type.String({ minLength: 1 })),
    identity: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
)

interface ComparisonsWriteInput {
  readonly action: 'create' | 'remove' | 'clear'
  readonly symbol?: string
  readonly market?: string
  readonly exchange?: string
  readonly source?: string
  readonly instrumentType?: (typeof KNOWN_INSTRUMENT_TYPES)[number]
  readonly period?: string
  readonly adjust?: string
  readonly identity?: string
}

export const COMPARISONS_LIST_METADATA: ChartToolMetadata = {
  name: 'comparisons_list',
  label: 'List comparison symbols',
  description:
    'List every comparison symbol currently overlaid on the price chart. Each item exposes the stable identity, the complete symbol spec, and the assigned line color. Use identity with comparisons_write.',
  effect: 'read',
}

export const COMPARISONS_WRITE_METADATA: ChartToolMetadata = {
  name: 'comparisons_write',
  label: 'Edit comparison symbols',
  description:
    'Add, remove or clear comparison symbols on the price chart. ' +
    'create: symbol, optionally narrowed by source, exchange and instrumentType. ' +
    'When a symbol matches several instruments nothing is added and the result is { status: "ambiguous", candidates } — ask the user with ask_user, then retry with the chosen candidate\'s source and exchange. Never pick a candidate yourself. ' +
    'remove: identity from comparisons_list. clear: nothing.',
  effect: 'write',
}

/** 列出当前对比品种。 */
export function createComparisonsListTool(comparisons: ComparisonCommandsApi): ChartToolDefinition {
  return {
    ...COMPARISONS_LIST_METADATA,
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute() {
      const items = comparisons.list()
      return jsonResult(items, `Returned ${items.length} comparisons.`)
    },
  }
}

/** 对比品种写工具；歧义结果原样返回给模型，不在这里替用户裁决。 */
export function createComparisonsWriteTool(
  comparisons: ComparisonCommandsApi,
): ChartToolDefinition {
  return {
    ...COMPARISONS_WRITE_METADATA,
    parameters: ComparisonsWriteParameters,
    summarizeInput: (input) => {
      const args = input as ComparisonsWriteInput
      return args.symbol ?? args.identity ?? args.action
    },
    async execute(input) {
      const args = input as ComparisonsWriteInput
      switch (args.action) {
        case 'create': {
          requireFields(
            args,
            ['symbol'],
            'Use instruments_query to resolve an exact symbol before adding a comparison.',
          )
          const result = await comparisons.create({
            symbol: args.symbol!,
            ...(args.market === undefined ? {} : { market: args.market }),
            ...(args.exchange === undefined ? {} : { exchange: args.exchange }),
            ...(args.source === undefined ? {} : { source: args.source }),
            ...(args.instrumentType === undefined ? {} : { instrumentType: args.instrumentType }),
            ...(args.period === undefined ? {} : { period: args.period }),
            ...(args.adjust === undefined ? {} : { adjust: args.adjust }),
          })
          return jsonResult(
            result,
            result.status === 'added'
              ? `Added comparison ${result.symbol}.`
              : `Symbol ${args.symbol} is ambiguous; ask the user to choose.`,
          )
        }
        case 'remove':
          requireFields(args, ['identity'])
          return jsonResult(
            { removed: comparisons.remove({ identity: args.identity! }) },
            `Removed comparison ${args.identity}.`,
          )
        case 'clear':
          return jsonResult({ removed: comparisons.clear() }, 'Cleared every comparison.')
      }
    },
  }
}
