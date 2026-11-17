/** 图元工具：落点用主图或指标实例表达，锚点用交易日与价格。 */
import { Type } from 'typebox'

import {
  AGENT_DRAWING_KINDS,
  DRAWING_LABEL_INDEX_PATTERN,
} from '../../../../engine/drawing/index.js'
import { ToolInputValidationError } from '../../../../foundation/agent/index.js'
import { AGENT_DRAWING_COLOR_VALUES } from '../../../../foundation/tokens/agentDrawingColors.js'
import type { ChartAgentDrawingCommands } from '../../types.js'
import type { ChartToolDefinition, ChartToolMetadata } from '../types.js'
import { jsonResult, requireFields } from './helpers.js'

const TradingDate = Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
const DrawingKind = Type.Enum([...AGENT_DRAWING_KINDS])
const DrawingColor = Type.Enum(AGENT_DRAWING_COLOR_VALUES)
const DrawingAnchor = Type.Object(
  { tradingDate: Type.Optional(TradingDate), price: Type.Number() },
  { additionalProperties: false },
)
const DrawingStyle = Type.Partial(
  Type.Object({
    stroke: DrawingColor,
    strokeWidth: Type.Number({ exclusiveMinimum: 0 }),
    strokeStyle: Type.Union([
      Type.Literal('solid'),
      Type.Literal('dashed'),
      Type.Literal('dotted'),
    ]),
    fill: DrawingColor,
    fillOpacity: Type.Number({ minimum: 0, maximum: 1 }),
    pointRadius: Type.Number({ exclusiveMinimum: 0 }),
    textColor: DrawingColor,
    fontSize: Type.Number({ exclusiveMinimum: 0 }),
  }),
  { additionalProperties: false },
)
const DrawingLabel = Type.Object(
  {
    text: Type.String({ description: '标签文本。使用字面量 \\n 作为唯一换行控制码。' }),
    position: Type.Union([Type.Literal('start'), Type.Literal('center'), Type.Literal('end')]),
  },
  { additionalProperties: false },
)
const DrawingLabelRecord = Type.Record(
  Type.String({ pattern: DRAWING_LABEL_INDEX_PATTERN }),
  DrawingLabel,
  {
    additionalProperties: false,
    description: '键为渲染输出的线段或区域序号，从 "0" 起的字符串数字。',
  },
)
const DrawingLabels = Type.Object(
  { line: DrawingLabelRecord, area: DrawingLabelRecord },
  { additionalProperties: false },
)

const Placement = Type.String({
  minLength: 1,
  description:
    'Where the drawing lives: "main" for the price chart, or an indicator instanceId from indicators_list for its pane.',
})

const DrawingsWriteParameters = Type.Object(
  {
    action: Type.Union([
      Type.Literal('create'),
      Type.Literal('update'),
      Type.Literal('delete'),
      Type.Literal('copy'),
      Type.Literal('clear'),
    ]),
    placement: Type.Optional(Placement),
    kind: Type.Optional(DrawingKind),
    anchors: Type.Optional(
      Type.Array(DrawingAnchor, {
        minItems: 1,
        maxItems: 3,
        description:
          'Anchor count depends on kind: 1 for horizontal-line, 2 or 3 for the rest. Non-horizontal anchors need tradingDate.',
      }),
    ),
    style: Type.Optional(Type.Partial(DrawingStyle)),
    labels: Type.Optional(DrawingLabels),
    visible: Type.Optional(Type.Boolean()),
    locked: Type.Optional(Type.Boolean()),
    zIndex: Type.Optional(Type.Number()),
    drawingId: Type.Optional(Type.String({ minLength: 1 })),
    drawingIds: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), { minItems: 1, uniqueItems: true }),
    ),
  },
  { additionalProperties: false },
)

interface DrawingsWriteInput {
  readonly action: 'create' | 'update' | 'delete' | 'copy' | 'clear'
  readonly placement?: string
  readonly kind?: string
  readonly anchors?: ReadonlyArray<{ readonly tradingDate?: string; readonly price: number }>
  readonly style?: Readonly<Record<string, string | number | undefined>>
  readonly labels?: Parameters<ChartAgentDrawingCommands['create']>[0]['labels']
  readonly visible?: boolean
  readonly locked?: boolean
  readonly zIndex?: number
  readonly drawingId?: string
  readonly drawingIds?: ReadonlyArray<string>
}

export const DRAWINGS_LIST_METADATA: ChartToolMetadata = {
  name: 'drawings_list',
  label: 'List drawings',
  description:
    'List every committed chart drawing. Each item exposes id, kind, placement, anchors (timestamp and price), style, labels and visibility. Use id with drawings_write.',
  effect: 'read',
}

export const DRAWINGS_WRITE_METADATA: ChartToolMetadata = {
  name: 'drawings_write',
  label: 'Edit drawings',
  description:
    'Create, update, copy, delete or clear chart drawings. ' +
    'create: placement, kind, anchors, style. update: drawingId plus the fields to replace. ' +
    'delete: drawingId. copy: drawingIds. clear: nothing. ' +
    'placement is "main" or an indicator instanceId from indicators_list; ids come from drawings_list.',
  effect: 'write',
}

/** 列出已提交图元。 */
export function createDrawingsListTool(drawings: ChartAgentDrawingCommands): ChartToolDefinition {
  return {
    ...DRAWINGS_LIST_METADATA,
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute() {
      const items = drawings.list()
      return jsonResult(items, `Returned ${items.length} drawings.`)
    },
  }
}

/** 图元写工具；落点由 Core 解析为容器，调用方不接触 paneId。 */
export function createDrawingsWriteTool(drawings: ChartAgentDrawingCommands): ChartToolDefinition {
  return {
    ...DRAWINGS_WRITE_METADATA,
    parameters: DrawingsWriteParameters,
    summarizeInput: (input) => {
      const args = input as DrawingsWriteInput
      return args.drawingId ? `${args.action} ${args.drawingId}` : args.action
    },
    async execute(input) {
      const args = input as DrawingsWriteInput
      switch (args.action) {
        case 'create':
          requireFields(
            args,
            ['placement', 'kind', 'anchors', 'style'],
            'Read indicators_list for valid placements and drawings_list for existing drawings.',
          )
          if (args.style?.stroke === undefined)
            throw new ToolInputValidationError(
              'action=create requires style.stroke. Supply a stroke color from the drawing color values.',
            )
          return jsonResult(
            drawings.create({
              placement: args.placement!,
              kind: args.kind!,
              anchors: args.anchors!,
              style: args.style ?? {},
              ...(args.labels === undefined ? {} : { labels: args.labels }),
              ...(args.visible === undefined ? {} : { visible: args.visible }),
              ...(args.locked === undefined ? {} : { locked: args.locked }),
              ...(args.zIndex === undefined ? {} : { zIndex: args.zIndex }),
            }),
            'Created one drawing.',
          )
        case 'update': {
          requireFields(args, ['drawingId'])
          const patch = {
            ...(args.anchors === undefined ? {} : { anchors: args.anchors }),
            ...(args.style === undefined ? {} : { style: args.style }),
            ...(args.labels === undefined ? {} : { labels: args.labels }),
            ...(args.visible === undefined ? {} : { visible: args.visible }),
            ...(args.locked === undefined ? {} : { locked: args.locked }),
            ...(args.zIndex === undefined ? {} : { zIndex: args.zIndex }),
          }
          if (Object.keys(patch).length === 0)
            requireFields(args, ['anchors'], 'Supply at least one field to replace.')
          return jsonResult(
            { drawing: drawings.update(args.drawingId!, patch) },
            `Updated drawing ${args.drawingId}.`,
          )
        }
        case 'delete':
          requireFields(args, ['drawingId'])
          return jsonResult(
            { removed: drawings.remove(args.drawingId!) },
            `Deleted drawing ${args.drawingId}.`,
          )
        case 'copy':
          requireFields(args, ['drawingIds'])
          return jsonResult(
            drawings.copy(args.drawingIds!),
            `Copied ${args.drawingIds!.length} drawings.`,
          )
        case 'clear':
          return jsonResult({ removed: drawings.clear() }, 'Cleared every drawing.')
      }
    },
  }
}
