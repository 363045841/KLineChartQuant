/** 指标实例工具：读写分离，身份由图表分配，落点用语义表达。 */
import { Type } from 'typebox'

import { ToolInputValidationError } from '../../../../foundation/agent/index.js'
import type { ChartAgentIndicatorCommands } from '../../types.js'
import type { ChartToolDefinition, ChartToolMetadata } from '../types.js'
import { jsonResult, requireFields } from './helpers.js'

const IndicatorParams = Type.Record(Type.String(), Type.Unknown())

const IndicatorsWriteParameters = Type.Object(
  {
    action: Type.Union([
      Type.Literal('add'),
      Type.Literal('update'),
      Type.Literal('move'),
      Type.Literal('remove'),
      Type.Literal('clear'),
    ]),
    instanceId: Type.Optional(Type.String({ minLength: 1 })),
    definitionId: Type.Optional(Type.String({ minLength: 1 })),
    params: Type.Optional(IndicatorParams),
    placement: Type.Optional(
      Type.Union([Type.Literal('main'), Type.Literal('sub')], {
        description: 'main overlays the indicator on the price chart; sub gives it its own pane.',
      }),
    ),
    targetRow: Type.Optional(
      Type.Integer({ minimum: 0, description: 'Zero-based chart row to move the indicator to.' }),
    ),
  },
  { additionalProperties: false },
)

interface IndicatorsWriteInput {
  readonly action: 'add' | 'update' | 'move' | 'remove' | 'clear'
  readonly instanceId?: string
  readonly definitionId?: string
  readonly params?: Readonly<Record<string, unknown>>
  readonly placement?: 'main' | 'sub'
  readonly targetRow?: number
}

export const INDICATORS_LIST_METADATA: ChartToolMetadata = {
  name: 'indicators_list',
  label: 'List chart indicators',
  description:
    'List every indicator currently on the chart. Each item exposes instanceId, definitionId, params, placement (main or sub), row and visibility. Use instanceId with indicators_write; never invent identities.',
  effect: 'read',
}

export const INDICATORS_WRITE_METADATA: ChartToolMetadata = {
  name: 'indicators_write',
  label: 'Edit chart indicators',
  description:
    'Add, update, move, remove or clear chart indicators. ' +
    'add: definitionId plus optional params/placement. ' +
    'update: instanceId plus params, definitionId or placement. ' +
    'move: instanceId and targetRow. remove: instanceId. clear: nothing. ' +
    'The chart assigns instance and pane identities; read them from indicators_list instead of inventing ids.',
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

/** 读写指标实例；每个 action 的必填字段在分发前显式校验。 */
export function createIndicatorsWriteTool(
  indicators: ChartAgentIndicatorCommands,
): ChartToolDefinition {
  return {
    ...INDICATORS_WRITE_METADATA,
    parameters: IndicatorsWriteParameters,
    summarizeInput: (input) => {
      const args = input as IndicatorsWriteInput
      return args.instanceId ? `${args.action} ${args.instanceId}` : args.action
    },
    async execute(input) {
      const args = input as IndicatorsWriteInput
      switch (args.action) {
        case 'add': {
          requireFields(
            args,
            ['definitionId'],
            'Use indicators_list to see what is already on the chart, then pass a definitionId.',
          )
          const definitionId = await indicators.resolveDefinition(args.definitionId!)
          if (!definitionId) throw unrenderableIndicator(args.definitionId!, args.placement)
          const instanceId = indicators.add(definitionId, args.params, args.placement)
          return jsonResult({ created: instanceId }, `Added indicator ${definitionId}.`)
        }
        case 'update': {
          requireFields(args, ['instanceId'])
          if (
            args.definitionId === undefined &&
            args.params === undefined &&
            args.placement === undefined
          )
            throw new ToolInputValidationError(
              'action=update requires at least one of definitionId, params or placement.',
            )
          let definitionId: string | undefined
          if (args.definitionId !== undefined) {
            const resolved = await indicators.resolveDefinition(args.definitionId)
            if (!resolved) throw unrenderableIndicator(args.definitionId, args.placement)
            definitionId = resolved
          }
          const updated = indicators.update(args.instanceId!, {
            ...(definitionId === undefined ? {} : { definitionId }),
            ...(args.params === undefined ? {} : { params: args.params }),
            ...(args.placement === undefined ? {} : { placement: args.placement }),
          })
          return jsonResult({ updated }, `Updated indicator ${args.instanceId}.`)
        }
        case 'move': {
          requireFields(args, ['instanceId', 'targetRow'])
          return jsonResult(
            { moved: indicators.move(args.instanceId!, args.targetRow!) },
            `Moved indicator ${args.instanceId} to row ${args.targetRow}.`,
          )
        }
        case 'remove':
          requireFields(args, ['instanceId'])
          return jsonResult(
            { removed: indicators.remove(args.instanceId!) },
            `Removed indicator ${args.instanceId}.`,
          )
        case 'clear':
          return jsonResult({ removed: indicators.clear() }, 'Cleared every indicator.')
      }
    },
  }
}

/** 指标定义无法渲染时的可纠正错误。 */
function unrenderableIndicator(
  definitionId: string,
  placement: 'main' | 'sub' | undefined,
): ToolInputValidationError {
  const target = placement ?? 'a chart pane'
  return new ToolInputValidationError(
    `Indicator '${definitionId}' cannot render in ${target}. Use indicators_list for what is on the chart, or pick a definition that has a renderer.`,
  )
}
