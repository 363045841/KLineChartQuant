/** 指标实例工具：按名称与位置定位，内部实例 ID 不进入工具契约。 */
import { Type } from 'typebox'

import { ToolInputValidationError } from '../../../../foundation/agent/index.js'
import {
  describeParam,
  type IndicatorInputIssue,
  parseIndicatorInputs,
} from '../../impl/indicator/parseIndicatorInputs.js'
import type {
  ChartAgentIndicatorCommands,
  ChartAgentIndicatorDefinition,
  ChartAgentIndicatorTarget,
  ChartAgentIndicatorView,
} from '../../types.js'
import type { ChartToolDefinition, ChartToolMetadata } from '../types.js'
import { jsonResult, rejectUnusedFields, requireFields } from './helpers.js'

const IndicatorInputs = Type.Record(Type.String(), Type.Unknown(), {
  description:
    'Input object declared by the indicator. add accepts a subset; update replaces the complete set.',
})

const IndicatorTarget = Type.Object(
  {
    indicator: Type.String({
      minLength: 1,
      description: 'Indicator name or id from indicators_list, for example MACD.',
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
        description: 'add only: exact indicator name or id, for example MACD.',
      }),
    ),
    inputs: Type.Optional(IndicatorInputs),
    placement: Type.Optional(
      Type.Union([Type.Literal('main'), Type.Literal('sub')], {
        description:
          'add only: main overlays the price chart; sub gives the indicator its own pane.',
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
  readonly inputs?: Readonly<Record<string, unknown>>
  readonly placement?: 'main' | 'sub'
  readonly target?: ChartAgentIndicatorTarget
  readonly targetRow?: number
}

/** 各 action 接受的字段；扁平 schema 无法表达，因此分发前显式拒绝多余字段。 */
const ALLOWED_FIELDS: Readonly<Record<string, ReadonlyArray<string>>> = {
  add: ['indicator', 'inputs', 'placement'],
  update: ['target', 'inputs'],
  move: ['target', 'targetRow'],
  remove: ['target'],
}

export const INDICATORS_LIST_METADATA: ChartToolMetadata = {
  name: 'indicators_list',
  label: 'List chart indicators',
  description:
    'List every indicator on the chart. Each item exposes indicator (id), name (display name), inputs, placement (main or sub), row (0 is the top row; the main chart can be at any row) and order (1-based position within the row). Use that indicator/row/order combination as the target for indicators_write; never invent positions.',
  effect: 'read',
}

export const INDICATORS_WRITE_METADATA: ChartToolMetadata = {
  name: 'indicators_write',
  label: 'Edit chart indicators',
  description:
    'Add, update, move or remove chart indicators. ' +
    'add: indicator plus optional inputs and placement; omitted inputs take the defaults of that indicator. ' +
    'update: target plus inputs. inputs is the COMPLETE set and replaces the stored inputs; if you do not know the current values, call indicators_list first. ' +
    'move: target plus targetRow. remove: target. ' +
    'target is { indicator, row?, order? }: indicator is the id or name from indicators_list; row is the display row (0 is the top row, the main chart can be at any row); add row and order only when several instances share the name. ' +
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
      return jsonResult({ indicators: items }, `Returned ${items.length} indicators.`)
    },
  }
}

/** 读写指标实例；输入先按定义声明校验，再交给领域命令。 */
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
      rejectUnusedFields(args, ALLOWED_FIELDS)
      switch (args.action) {
        case 'add': {
          requireFields(args, ['indicator'])
          const definition = await requireDefinition(indicators, args.indicator!)
          const inputs = parseInputs(definition, args.inputs ?? {}, false)
          const view = indicators.add(definition.indicator, inputs, args.placement)
          return jsonResult({ indicator: view }, describeAction('Added', view))
        }
        case 'update': {
          requireFields(
            args,
            ['target', 'inputs'],
            'action=update requires the complete inputs object; call indicators_list first if you do not know the current values.',
          )
          const current = indicators.read(args.target!)
          const definition = await requireDefinition(indicators, current.indicator)
          const inputs = parseInputs(definition, args.inputs!, true, current.inputs)
          const view = indicators.update(args.target!, inputs)
          return jsonResult({ indicator: view }, describeAction('Updated', view))
        }
        case 'move': {
          requireFields(args, ['target', 'targetRow'])
          const view = indicators.move(args.target!, args.targetRow!)
          return jsonResult({ indicator: view }, describeAction('Moved', view))
        }
        case 'remove': {
          requireFields(args, ['target'])
          const view = indicators.remove(args.target!)
          return jsonResult({ indicator: view }, describeAction('Removed', view))
        }
      }
    },
  }
}

/** 解析定义并带回输入声明；未知名称列出当前图表上的精确名称。 */
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
          .map(
            (item) => `${item.indicator} ('${item.name}') at row ${item.row} order ${item.order}`,
          )
          .join('; ')}.`
  throw new ToolInputValidationError(
    `Unknown indicator '${indicator}'. ${chart} Use the exact registered name or id.`,
  )
}

/**
 * 校验输入并转成工具错误。
 *
 * update 要求完整输入集；错误里带当前实例输入，模型可在同一轮补齐后重试。
 */
function parseInputs(
  definition: ChartAgentIndicatorDefinition,
  input: Readonly<Record<string, unknown>>,
  requireComplete: boolean,
  current?: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const result = parseIndicatorInputs(definition.inputs, input, { requireComplete })
  if (result.ok) return result.inputs
  const problems = result.issues.map(describeIssue).join('; ')
  const allowed = definition.inputs.map(describeParam).join('; ')
  const currentLine =
    current === undefined
      ? ''
      : ` Current inputs for this instance: ${JSON.stringify(current)}. inputs replaces the complete set, so resend every key you want to keep; call indicators_list if unsure.`
  throw new ToolInputValidationError(
    `Invalid inputs for indicator '${definition.indicator}': ${problems}. Allowed inputs: ${allowed}.${currentLine}`,
  )
}

/** 把单条输入问题压成一句可执行说明。 */
function describeIssue(issue: IndicatorInputIssue): string {
  switch (issue.reason) {
    case 'unknown':
      return `unknown input '${issue.key}'`
    case 'missing':
      return `missing input '${issue.key}'`
    default:
      return `'${issue.key}' must be ${issue.expected} (received ${JSON.stringify(issue.received)})`
  }
}

/** 写操作摘要统一使用最新的位置。 */
function describeAction(action: string, view: ChartAgentIndicatorView): string {
  return `${action} ${view.indicator} ('${view.name}') at row ${view.row} order ${view.order}.`
}
