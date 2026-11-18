/** 指标实例工具：按名称与位置定位，内部实例 ID 不进入工具契约。 */
import { Type } from 'typebox'

import { ToolInputValidationError } from '../../../../foundation/agent/index.js'
import {
  describeParam,
  type IndicatorParamIssue,
  parseIndicatorParams,
} from '../../impl/indicator/parseIndicatorParams.js'
import type {
  ChartAgentIndicatorCommands,
  ChartAgentIndicatorDefinition,
  ChartAgentIndicatorTarget,
} from '../../types.js'
import type { ChartToolDefinition, ChartToolMetadata } from '../types.js'
import { jsonResult, requireFields } from './helpers.js'

const IndicatorParams = Type.Record(Type.String(), Type.Unknown(), {
  description:
    'Parameter object declared by the indicator. add accepts a subset; update replaces the complete set.',
})

const IndicatorTarget = Type.Object(
  {
    indicator: Type.String({
      minLength: 1,
      description: 'Indicator name from indicators_list, for example MACD.',
    }),
    row: Type.Optional(
      Type.Integer({
        minimum: 0,
        description:
          'Chart display row from indicators_list: 0 is the top row. The main chart can be at any row. Omit when only one instance matches.',
      }),
    ),
    order: Type.Optional(
      Type.Integer({
        minimum: 1,
        description: '1-based position within the row. Omit when only one instance matches.',
      }),
    ),
  },
  { additionalProperties: false },
)

const IndicatorsWriteParameters = Type.Object(
  {
    action: Type.Union([
      Type.Literal('add'),
      Type.Literal('update'),
      Type.Literal('move'),
      Type.Literal('remove'),
    ]),
    indicator: Type.Optional(
      Type.String({
        minLength: 1,
        description: 'add only: exact indicator name, for example MACD.',
      }),
    ),
    params: Type.Optional(IndicatorParams),
    placement: Type.Optional(
      Type.Union([Type.Literal('main'), Type.Literal('sub')], {
        description: 'add only: main overlays the price chart; sub gives the indicator its own pane.',
      }),
    ),
    target: Type.Optional(IndicatorTarget),
    targetRow: Type.Optional(
      Type.Integer({
        minimum: 0,
        description:
          'move only: destination display row, where 0 is the top row. The main chart can be at any row.',
      }),
    ),
  },
  { additionalProperties: false },
)

interface IndicatorsWriteInput {
  readonly action: 'add' | 'update' | 'move' | 'remove'
  readonly indicator?: string
  readonly params?: Readonly<Record<string, unknown>>
  readonly placement?: 'main' | 'sub'
  readonly target?: ChartAgentIndicatorTarget
  readonly targetRow?: number
}

/** 各 action 接受的字段；扁平 schema 无法表达，因此分发前显式拒绝多余字段。 */
const ALLOWED_FIELDS: Readonly<Record<string, ReadonlyArray<string>>> = {
  add: ['indicator', 'params', 'placement'],
  update: ['target', 'params'],
  move: ['target', 'targetRow'],
  remove: ['target'],
}

export const INDICATORS_LIST_METADATA: ChartToolMetadata = {
  name: 'indicators_list',
  label: 'List chart indicators',
  description:
    'List every indicator on the chart. Each item exposes indicator (name), params, placement (main or sub), row (0 is the top row; the main chart can be at any row) and order (1-based position within the row). Use that indicator/row/order combination as the target for indicators_write; never invent positions.',
  effect: 'read',
}

export const INDICATORS_WRITE_METADATA: ChartToolMetadata = {
  name: 'indicators_write',
  label: 'Edit chart indicators',
  description:
    'Add, update, move or remove chart indicators. ' +
    'add: indicator plus optional params and placement; omitted params take the defaults of that indicator. ' +
    'update: target plus params. params is the COMPLETE parameter set and replaces the stored params; if you do not know the current values, call indicators_list first. ' +
    'move: target plus targetRow. remove: target. ' +
    'target is { indicator, row?, order? }: indicator is the name from indicators_list; row is the display row (0 is the top row, the main chart can be at any row); add row and order only when several instances share the name. ' +
    'Indicators cannot change type in place; remove and add when the indicator itself must change.',
  effect: 'write',
}

/** 列出现有指标实例。 */
export function createIndicatorsListTool(
  indicators: ChartAgentIndicatorCommands,
): ChartToolDefinition {
  return {
    ...INDICATORS_LIST_METADATA,
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute() {
      const items = indicators.list()
      return jsonResult(items, `Returned ${items.length} indicators.`)
    },
  }
}

/** 读写指标实例；参数先按定义声明校验，再交给领域命令。 */
export function createIndicatorsWriteTool(
  indicators: ChartAgentIndicatorCommands,
): ChartToolDefinition {
  return {
    ...INDICATORS_WRITE_METADATA,
    parameters: IndicatorsWriteParameters,
    summarizeInput: (input) => {
      const args = input as IndicatorsWriteInput
      const name = args.action === 'add' ? args.indicator : args.target?.indicator
      return name ? `${args.action} ${name}` : args.action
    },
    async execute(input) {
      const args = input as IndicatorsWriteInput
      rejectUnusedFields(args)
      switch (args.action) {
        case 'add': {
          requireFields(args, ['indicator'])
          const definition = await requireDefinition(indicators, args.indicator!)
          const params = parseParams(definition, args.params ?? {}, false)
          const view = indicators.add(definition.indicator, params, args.placement)
          return jsonResult({ added: view }, describeAction('Added', view))
        }
        case 'update': {
          requireFields(
            args,
            ['target', 'params'],
            'action=update requires the complete params object; call indicators_list first if you do not know the current values.',
          )
          const current = indicators.read(args.target!)
          const definition = await requireDefinition(indicators, current.indicator)
          const params = parseParams(definition, args.params!, true, current.params)
          const view = indicators.update(args.target!, params)
          return jsonResult({ updated: view }, describeAction('Updated', view))
        }
        case 'move': {
          requireFields(args, ['target', 'targetRow'])
          const view = indicators.move(args.target!, args.targetRow!)
          return jsonResult({ moved: view }, describeAction('Moved', view))
        }
        case 'remove': {
          requireFields(args, ['target'])
          const view = indicators.remove(args.target!)
          return jsonResult({ removed: view }, describeAction('Removed', view))
        }
      }
    },
  }
}

/** 拒绝当前 action 不接受的字段，避免扁平 schema 静默忽略错放的参数。 */
function rejectUnusedFields(args: IndicatorsWriteInput): void {
  const allowed = ALLOWED_FIELDS[args.action]
  if (allowed === undefined)
    throw new ToolInputValidationError(`Unsupported action '${String(args.action)}'.`)
  const unused = Object.keys(args).filter((key) => key !== 'action' && !allowed.includes(key))
  if (unused.length === 0) return
  throw new ToolInputValidationError(
    `action=${args.action} does not accept ${unused.join(', ')}. Allowed fields: ${allowed.join(', ')}.`,
  )
}

/** 解析定义并带回参数声明；未知名称列出当前图表上的精确名称。 */
async function requireDefinition(
  indicators: ChartAgentIndicatorCommands,
  indicator: string,
): Promise<ChartAgentIndicatorDefinition> {
  const definition = await indicators.resolveDefinition(indicator)
  if (definition !== null) return definition
  const current = indicators.list()
  const chart =
    current.length === 0
      ? 'No indicators are on this chart.'
      : `This chart currently has: ${current
          .map((item) => `${item.indicator} at row ${item.row} order ${item.order}`)
          .join('; ')}.`
  throw new ToolInputValidationError(
    `Unknown indicator '${indicator}'. ${chart} Use the exact registered name.`,
  )
}

/**
 * 校验参数并转成工具错误。
 *
 * update 要求完整参数集；错误里带当前实例参数，模型可在同一轮补齐后重试。
 */
function parseParams(
  definition: ChartAgentIndicatorDefinition,
  input: Readonly<Record<string, unknown>>,
  requireComplete: boolean,
  current?: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const result = parseIndicatorParams(definition.params, input, { requireComplete })
  if (result.ok) return result.params
  const problems = result.issues.map(describeIssue).join('; ')
  const allowed = definition.params.map(describeParam).join('; ')
  const currentLine =
    current === undefined
      ? ''
      : ` Current params for this instance: ${JSON.stringify(current)}. params replaces the complete set, so resend every key you want to keep; call indicators_list if unsure.`
  throw new ToolInputValidationError(
    `Invalid params for indicator '${definition.indicator}': ${problems}. Allowed params: ${allowed}.${currentLine}`,
  )
}

/** 把单条参数问题压成一句可执行说明。 */
function describeIssue(issue: IndicatorParamIssue): string {
  switch (issue.reason) {
    case 'unknown':
      return `unknown param '${issue.key}'`
    case 'missing':
      return `missing param '${issue.key}'`
    default:
      return `'${issue.key}' must be ${issue.expected} (received ${JSON.stringify(issue.received)})`
  }
}

/** 写操作摘要统一使用最新的位置。 */
function describeAction(action: string, view: { indicator: string; row: number; order: number }): string {
  return `${action} ${view.indicator} at row ${view.row} order ${view.order}.`
}
