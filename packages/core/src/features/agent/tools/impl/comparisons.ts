/**
 * 对比品种工具：列表返回模型可消费的投影字段，写工具按动作校验字段。
 *
 * 身份由系统分配并从 list / create 返回，update 与 remove 只用 identity 寻址；
 * 品种寻址字段与 instruments_query 的输出列同构，source 省略时由 Core 自行解析。
 */
import { Type } from 'typebox'

import type { KnownInstrumentType } from '../../../../data/provider/types.js'
import type { ChartAgentComparisonCommands } from '../../types.js'
import type { ChartToolDefinition, ChartToolMetadata } from '../types.js'
import { jsonResult, rejectUnusedFields, requireFields } from './helpers.js'
import {
  InstrumentExchangeParameter,
  InstrumentSourceParameter,
  InstrumentTypeParameter,
} from './instrumentParameters.js'

const ComparisonsWriteParameters = Type.Object(
  {
    action: Type.Union(
      [Type.Literal('create'), Type.Literal('update'), Type.Literal('remove')],
      { description: 'create adds a comparison; update changes its visibility; remove deletes it.' },
    ),
    symbol: Type.Optional(
      Type.String({
        minLength: 1,
        description: 'create only: exact symbol from instruments_query, for example "600519".',
      }),
    ),
    exchange: InstrumentExchangeParameter,
    source: InstrumentSourceParameter,
    instrumentType: InstrumentTypeParameter,
    identity: Type.Optional(
      Type.String({
        minLength: 1,
        description: 'update/remove only: identity from comparisons_list or a previous create.',
      }),
    ),
    visible: Type.Optional(
      Type.Boolean({
        description: 'update only: true shows the line, false hides it without removing it.',
      }),
    ),
  },
  { additionalProperties: false },
)

interface ComparisonsWriteInput {
  readonly action: 'create' | 'update' | 'remove'
  readonly symbol?: string
  readonly exchange?: string
  readonly source?: string
  readonly instrumentType?: KnownInstrumentType
  readonly identity?: string
  readonly visible?: boolean
}

export const COMPARISONS_LIST_METADATA: ChartToolMetadata = {
  name: 'comparisons_list',
  label: 'List comparison symbols',
  description:
    'List every comparison line on the price chart. Each item has identity, symbol, name, exchange, source, instrumentType, color and visible. Comparison lines always use the main chart period and adjustment. Use identity with comparisons_write; never invent identities.',
  effect: 'read',
}

export const COMPARISONS_WRITE_METADATA: ChartToolMetadata = {
  name: 'comparisons_write',
  label: 'Edit comparison symbols',
  description:
    'Add, show/hide or remove comparison lines on the price chart. ' +
    'create: symbol plus the optional routing fields returned by instruments_query (exchange, source, instrumentType). ' +
    'If a symbol matches several instruments, nothing is added and { status: "ambiguous", candidates } is returned: ask the user with ask_user, then retry create with the chosen candidate\'s symbol, exchange, source and instrumentType; never pick one yourself. ' +
    'update: identity plus visible. remove: identity. ' +
    'Comparison lines always use the main chart period and adjustment.',
  effect: 'write',
}

/** 列出当前对比品种；只返回投影字段，不展开领域对象。 */
export function createComparisonsListTool(
  comparisons: ChartAgentComparisonCommands,
): ChartToolDefinition {
  return {
    ...COMPARISONS_LIST_METADATA,
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute() {
      const items = comparisons.list()
      return jsonResult({ comparisons: items }, `Returned ${items.length} comparisons.`)
    },
  }
}

/** 对比品种写工具；歧义结果原样返回给模型，不在这里替用户裁决。 */
export function createComparisonsWriteTool(
  comparisons: ChartAgentComparisonCommands,
): ChartToolDefinition {
  return {
    ...COMPARISONS_WRITE_METADATA,
    parameters: ComparisonsWriteParameters,
    summarizeInput: (input) => {
      const args = input as ComparisonsWriteInput
      return args.action === 'create' ? (args.symbol ?? '') : (args.identity ?? args.action)
    },
    async execute(input, context) {
      const args = input as ComparisonsWriteInput
      rejectUnusedFields(args, ALLOWED_FIELDS)
      switch (args.action) {
        case 'create': {
          requireFields(args, ['symbol'])
          const result = await comparisons.create(
            {
              symbol: args.symbol!,
              ...(args.exchange === undefined ? {} : { exchange: args.exchange }),
              ...(args.source === undefined ? {} : { source: args.source }),
              ...(args.instrumentType === undefined
                ? {}
                : { instrumentType: args.instrumentType }),
            },
            context.signal,
          )
          return jsonResult(
            result,
            result.status === 'added'
              ? `Added comparison ${result.comparison.symbol} on ${result.comparison.source}.`
              : `Symbol ${args.symbol} is ambiguous; ask the user to choose.`,
          )
        }
        case 'update': {
          requireFields(args, ['identity', 'visible'])
          const comparison = comparisons.setVisible(args.identity!, args.visible!)
          return jsonResult(
            { comparison },
            `${comparison.visible ? 'Showed' : 'Hid'} comparison ${comparison.symbol}.`,
          )
        }
        case 'remove': {
          requireFields(args, ['identity'])
          const comparison = comparisons.remove(args.identity!)
          return jsonResult({ comparison }, `Removed comparison ${comparison.symbol}.`)
        }
      }
    },
  }
}

/** 各 action 接受的字段；扁平 schema 无法表达，因此分发前显式拒绝多余字段。 */
const ALLOWED_FIELDS: Readonly<Record<ComparisonsWriteInput['action'], ReadonlyArray<string>>> = {
  create: ['symbol', 'exchange', 'source', 'instrumentType'],
  update: ['identity', 'visible'],
  remove: ['identity'],
}
